import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

const publicProject = { id: "project-a", title: "Atlas", publicSummary: "Public launch plan", approved: true, publicItems: [{ id: "public-1", title: "Landing page" }], publicItemCount: 1 };
const memberProject = { id: "project-a", title: "Atlas", publicSummary: "Public launch plan", items: [{ id: "public-1", title: "Landing page", visibility: "public" as const }, { id: "internal-2", title: "Pricing review", visibility: "internal" as const }], itemCount: 2, internalNote: "Review with finance" };

function repository() {
  let publicReads = 0;
  let memberReads = 0;
  return {
    value: {
      getPublicProject(projectId: string) { publicReads += 1; return projectId === "project-a" ? structuredClone(publicProject) : projectId === "draft-a" ? { ...structuredClone(publicProject), id: "draft-a", approved: false } : null; },
      getMemberProject(organisationId: string, projectId: string) { memberReads += 1; return organisationId === "north" && projectId === "project-a" ? structuredClone(memberProject) : null; },
    },
    reads: () => ({ publicReads, memberReads }),
  };
}

async function reader(path: string) {
  return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as typeof import("../reference/src/project-summary")).readProjectSummary;
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const read = await reader(candidatePath);
  return evaluateV2([
    {
      id: "malformed-viewer-is-denied-before-project-read",
      run() {
        const test = repository();
        expect(read({ organisationId: "north" }, "project-a", test.value)).toBeNull();
        expect(read({ role: "member", organisationId: " " }, "project-a", test.value)).toBeNull();
        expect(test.reads()).toEqual({ publicReads: 0, memberReads: 0 });
      },
    },
    {
      id: "missing-and-cross-organisation-are-indistinguishable",
      run() {
        const missing = repository();
        const foreign = repository();
        expect(read({ role: "member", organisationId: "north" }, "missing", missing.value)).toBeNull();
        expect(read({ role: "member", organisationId: "south" }, "project-a", foreign.value)).toBeNull();
      },
    },
    {
      id: "anonymous-view-is-approved-and-public-only",
      run() {
        const test = repository();
        expect(read({ role: "anonymous" }, "project-a", test.value)).toEqual({ id: "project-a", title: "Atlas", summary: "Public launch plan", items: [{ id: "public-1", title: "Landing page" }], itemCount: 1 });
        expect(read({ role: "anonymous" }, "draft-a", test.value)).toBeNull();
      },
    },
    {
      id: "member-view-is-organisation-scoped-and-complete",
      run() {
        const test = repository();
        expect(read({ role: "member", organisationId: "north" }, "project-a", test.value)).toEqual({ id: "project-a", title: "Atlas", summary: "Public launch plan", items: [{ id: "public-1", title: "Landing page", visibility: "public" }, { id: "internal-2", title: "Pricing review", visibility: "internal" }], itemCount: 2, internalNote: "Review with finance" });
      },
    },
  ], [
    {
      id: "anonymous-uses-only-public-projection",
      maxPoints: 50,
      run() {
        const test = repository();
        read({ role: "anonymous" }, "project-a", test.value);
        return test.reads().publicReads === 1 && test.reads().memberReads === 0 ? 50 : 0;
      },
    },
    {
      id: "member-uses-one-scoped-member-projection",
      maxPoints: 50,
      run() {
        const test = repository();
        read({ role: "member", organisationId: "north" }, "project-a", test.value);
        return test.reads().publicReads === 0 && test.reads().memberReads === 1 ? 50 : 0;
      },
    },
  ]);
}
