import { queryItems } from "./query.ts";

const itemsFile = process.argv[2];
const queryText = process.argv[3];

if (!itemsFile || !queryText) {
  console.error("Usage: bun run src/cli.ts <items-json> <query-json>");
  process.exit(2);
}

let items: unknown;
let query: unknown;
try {
  items = JSON.parse(await Bun.file(itemsFile).text());
  query = JSON.parse(queryText);
} catch {
  console.log(JSON.stringify({ items: [], page: 1, pageSize: 2, total: 0, error: { code: "invalid-query", message: "Invalid JSON" } }));
  process.exit(1);
}

const result = queryItems(items, query);
console.log(JSON.stringify(result));
process.exit(result.error ? 1 : 0);
