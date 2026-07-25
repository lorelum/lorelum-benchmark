import { joinPath, listFiles, sha256File, sha256Text } from "../../../fs";
import type { SkillBundle } from "./treatment-resolver";

export const publicRuleRouter = { id: "public-bm25", version: "v1", maxRules: 3 } as const;
export const declaredRuleRouter = { id: "public-task-context", version: "v1", maxRules: 3 } as const;

export type RoutedRule = { path: string; sha256: string; score: number };

export type RuleContext = {
  schema_version: "pi-rule-context/v1";
  router: typeof publicRuleRouter | typeof declaredRuleRouter;
  public_input_sha256: string;
  bundle_sha256: string;
  rules: RoutedRule[];
  sha256: string;
  text: string;
};

const stopWords = new Set(["about", "after", "allows", "also", "and", "are", "before", "build", "caller", "change", "declared", "dependencies", "does", "export", "file", "for", "from", "function", "implementation", "implement", "into", "load", "must", "not", "only", "original", "preserve", "public", "return", "should", "starter", "task", "that", "the", "their", "this", "using", "with"]);
const categoryTerms = new Set(["advanced", "api", "async", "bundle", "client", "js", "rendering", "rerender", "server"]);

function tokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z][a-z0-9]{2,}/g)?.map((token) => {
    if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
    if (token.endsWith("ly")) return token.slice(0, -2);
    if (token.endsWith("ed")) return token.slice(0, -2);
    if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
    return token;
  }).filter((token) => !stopWords.has(token)) ?? [];
}

function frequency(values: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

async function publicInput(taskPath: string): Promise<{ text: string; sha256: string }> {
  const files = ["task.md", ...(await listFiles(joinPath(taskPath, "public", "starter")))
    .map((file) => `starter/${file.replaceAll("\\", "/")}`)]
    .sort();
  const entries = await Promise.all(files.map(async (file) => {
    const path = joinPath(taskPath, "public", file);
    return { file, text: await Bun.file(path).text(), sha256: await sha256File(path) };
  }));
  return {
    text: entries.map((entry) => `## ${entry.file}\n${entry.text}`).join("\n"),
    sha256: await sha256Text(entries.map((entry) => `${entry.file}\0${entry.sha256}`).join("\n"))
  };
}

export async function routePublicRules(taskPath: string, bundle: SkillBundle): Promise<RuleContext> {
  const input = await publicInput(taskPath);
  const ruleFiles = (await listFiles(joinPath(bundle.path, "rules"))).filter((file) => file.endsWith(".md")).sort();
  if (ruleFiles.length === 0) throw new Error("Verified Skill bundle has no rule files");
  const documents = await Promise.all(ruleFiles.map(async (file) => ({
    path: `rules/${file.replaceAll("\\", "/")}`,
    text: await Bun.file(joinPath(bundle.path, "rules", file)).text(),
    metadata: file.replace(/\.md$/, "").replaceAll("-", " "),
    sha256: await sha256File(joinPath(bundle.path, "rules", file))
  })));
  const query = frequency(tokens(input.text));
  const documentTokens = documents.map((document) => frequency(tokens(document.metadata)));
  const metadataFrequency = new Map<string, number>();
  for (const document of documents) for (const term of new Set(tokens(document.metadata))) metadataFrequency.set(term, (metadataFrequency.get(term) ?? 0) + 1);
  const documentFrequency = new Map<string, number>();
  for (const terms of documentTokens) for (const term of terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const averageLength = documentTokens.reduce((total, terms) => total + [...terms.values()].reduce((sum, value) => sum + value, 0), 0) / documentTokens.length;
  const ranked = documents.map((document, index) => {
    const terms = documentTokens[index]!;
    const length = [...terms.values()].reduce((sum, value) => sum + value, 0);
    let score = 0;
    for (const [term, queryFrequency] of query) {
      const termFrequency = terms.get(term) ?? 0;
      if (termFrequency === 0) continue;
      const inverseFrequency = Math.log(1 + (documentTokens.length - (documentFrequency.get(term) ?? 0) + 0.5) / ((documentFrequency.get(term) ?? 0) + 0.5));
      score += queryFrequency * inverseFrequency * (termFrequency * 2.2) / (termFrequency + 1.2 * (0.25 + 0.75 * (length / averageLength)));
    }
    const metadataScore = [...new Set(tokens(document.metadata))]
      .filter((term) => query.has(term))
      .reduce((total, term) => total + Math.log(1 + documentTokens.length / (metadataFrequency.get(term) ?? 1)), 0);
    const distinctiveMatches = [...new Set(tokens(document.metadata))].filter((term) => query.has(term) && !categoryTerms.has(term)).length;
    score += 100 * metadataScore;
    return { ...document, score, metadataScore, distinctiveMatches };
  }).filter((document) => document.score > 0 && document.distinctiveMatches > 0)
    .sort((left, right) => right.metadataScore - left.metadataScore || right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, publicRuleRouter.maxRules);
  const rules = ranked.map(({ path, sha256, score }) => ({ path, sha256, score }));
  const text = [
    `<lorelum-rule-context schema="pi-rule-context/v1" router="${publicRuleRouter.id}/${publicRuleRouter.version}" public-input-sha256="${input.sha256}" bundle-sha256="${bundle.sha256}">`,
    ...ranked.map((rule) => `<lorelum-rule path="${rule.path}" sha256="${rule.sha256}">\n${rule.text}</lorelum-rule>`),
    "</lorelum-rule-context>"
  ].join("\n");
  return { schema_version: "pi-rule-context/v1", router: publicRuleRouter, public_input_sha256: input.sha256, bundle_sha256: bundle.sha256, rules, sha256: await sha256Text(text), text };
}

export async function declaredRuleContext(taskPath: string, bundle: SkillBundle, ruleNames: string[]): Promise<RuleContext> {
  if (ruleNames.length === 0 || ruleNames.length > declaredRuleRouter.maxRules || new Set(ruleNames).size !== ruleNames.length || ruleNames.some((rule) => !/^[a-z0-9-]+\.md$/.test(rule))) {
    throw new Error("Public rule context must declare one to three unique rule files");
  }
  const input = await publicInput(taskPath);
  const ranked = await Promise.all(ruleNames.map(async (name, index) => {
    const path = joinPath(bundle.path, "rules", name);
    if (!(await Bun.file(path).exists())) throw new Error(`Public rule context references missing rule: ${name}`);
    return { path: `rules/${name}`, text: await Bun.file(path).text(), sha256: await sha256File(path), score: declaredRuleRouter.maxRules - index };
  }));
  const rules = ranked.map(({ path, sha256, score }) => ({ path, sha256, score }));
  const text = [
    `<lorelum-rule-context schema="pi-rule-context/v1" router="${declaredRuleRouter.id}/${declaredRuleRouter.version}" public-input-sha256="${input.sha256}" bundle-sha256="${bundle.sha256}">`,
    ...ranked.map((rule) => `<lorelum-rule path="${rule.path}" sha256="${rule.sha256}">\n${rule.text}</lorelum-rule>`),
    "</lorelum-rule-context>"
  ].join("\n");
  return { schema_version: "pi-rule-context/v1", router: declaredRuleRouter, public_input_sha256: input.sha256, bundle_sha256: bundle.sha256, rules, sha256: await sha256Text(text), text };
}

export function routedRuleNames(context: Pick<RuleContext, "rules">): string[] {
  return context.rules.map((rule) => rule.path.slice("rules/".length));
}
