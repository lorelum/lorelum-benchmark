import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { sha256File } from "../../../fs";
import { validateIndexArchive } from "../../v1/index-archive";

// Official Linux x64 release artifact used by this version of the case.
const LORE_RELEASE_SHA256 = "675b837c378e9af3400bbcdb15af25d2bd021b9ea31f76c52a8660cb4aabec0f";
const exec = promisify(execFile);

export type LoreSupportOptions = {
  indexArchive: string;
  indexSha256: string;
  modelFile: string;
  modelSha256: string;
  releaseArchive: string;
  destination: string;
};

export type LoreSupport = {
  command: { executable: "/bin/sh"; args: ["/work/support/lore-command.sh"]; cwd: "." };
  requestPath: "support/request.txt";
  indexSha256: string;
  modelSha256: string;
  releaseSha256: string;
};

// Each invocation gets a new PID/network namespace and /dev tmpfs. The
// validated archive is restored there, preserving Lore's required symlinks
// without placing links or mutable Store state in Judge's candidate copy.
const wrapper = `#!/bin/sh
set -u
export HOME=/dev/lore-home TMPDIR=/dev/lore-tmp
mkdir -m 700 "$HOME" "$TMPDIR" "$HOME/.lorelum" /dev/lore-state || exit 2
tar -xf /work/support/index.tar -C /dev/lore-state || exit 2
printf 'embedding:\\n  modelPath: /work/support/model.gguf\\nquery:\\n  retrievalMethod: single-vector\\n' > "$HOME/.lorelum/config.yaml"
{ IFS= read -r action; IFS= read -r value; } < /work/support/request.txt || exit 2
case "$action" in
  query)
    /work/support/lore/lore --json --store-root /dev/lore-state/store --cache-root /dev/lore-state/cache --no-project query --mode single-vector --require-complete -- "$value" > /dev/lore-output
    status=$?
    ;;
  get)
    case "$value" in ''|-*|*[!A-Za-z0-9._-]*) echo 'Invalid Practice ID' >&2; exit 2;; esac
    /work/support/lore/lore --json --store-root /dev/lore-state/store --no-project get "$value" > /dev/lore-output
    status=$?
    # A missing Practice is a valid lookup result, not a failed sandbox. The
    # unchanged JSON error remains visible to the agent as the observation.
    if [ "$status" -eq 2 ] && grep -q '"code"[[:space:]]*:[[:space:]]*"practice[.]not-found"' /dev/lore-output; then status=0; fi
    ;;
  *) echo 'Expected query or get' >&2; exit 2;;
esac
cat /dev/lore-output
/work/support/lore/lore --json --store-root /dev/lore-state/store backend stop > /dev/lore-stop
stop=$?
if [ "$stop" -ne 0 ]; then cat /dev/lore-stop >&2; exit "$stop"; fi
exit "$status"
`;

/** Prepare a condition-scoped, immutable Lore support tree for Linux Judge. */
export async function provisionLoreSupport(options: LoreSupportOptions): Promise<LoreSupport> {
  if (process.platform !== "linux" || process.arch !== "x64") throw new Error("Lore support requires Linux x64");
  const { indexArchive, indexSha256, modelFile, modelSha256, releaseArchive, destination } = options;
  if (![indexArchive, modelFile, releaseArchive, destination].every(value => typeof value === "string" && isAbsolute(value)) ||
      !/^[a-f0-9]{64}$/.test(indexSha256) || !/^[a-f0-9]{64}$/.test(modelSha256)) {
    throw new Error("Expected absolute input paths and lowercase SHA-256 identities");
  }
  const target = resolve(destination);
  await mkdir(target, { mode: 0o700 });
  const stage = await mkdtemp(join(target, ".stage-"));
  try {
    const archive = join(target, "index.tar"), model = join(target, "model.gguf"), release = join(stage, "release.tar.gz");
    await copyFile(indexArchive, archive);
    await copyFile(modelFile, model);
    await copyFile(releaseArchive, release);
    if (await sha256File(archive) !== indexSha256) throw new Error("Index archive identity mismatch");
    await validateIndexArchive(archive);
    if (await sha256File(model) !== modelSha256) throw new Error("Embedding model identity mismatch");
    if (await sha256File(release) !== LORE_RELEASE_SHA256) throw new Error("Lore release identity mismatch");
    const lore = join(target, "lore");
    await mkdir(lore);
    await exec("tar", ["-xzf", release, "--strip-components=1", "--no-same-owner", "-C", lore]);
    await writeFile(join(target, "request.txt"), "", { mode: 0o600 });
    await writeFile(join(target, "lore-command.sh"), wrapper, { mode: 0o600 });
    await rm(stage, { recursive: true, force: true });
    return {
      command: { executable: "/bin/sh", args: ["/work/support/lore-command.sh"], cwd: "." },
      requestPath: "support/request.txt", indexSha256, modelSha256, releaseSha256: LORE_RELEASE_SHA256,
    };
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}
