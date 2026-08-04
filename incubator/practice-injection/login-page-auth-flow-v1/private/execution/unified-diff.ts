import { readdir, readFile } from "node:fs/promises";
import { sep } from "node:path";

const diffExcludes = new Set(["node_modules", "dist", "test-results", "playwright-report"]);

function normalizeDiffPath(target: string): string {
  return target.split(sep).join("/");
}

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split(/\r?\n/);
}

function longestCommonSubsequence(left: string[], right: string[]): number[][] {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const table: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      table[row][col] = left[row - 1] === right[col - 1]
        ? table[row - 1][col - 1] + 1
        : Math.max(table[row - 1][col], table[row][col - 1]);
    }
  }
  return table;
}

function unifiedFileDiff(relativePath: string, leftText: string, rightText: string): string {
  if (leftText === rightText) return "";
  const left = splitLines(leftText);
  const right = splitLines(rightText);
  const table = longestCommonSubsequence(left, right);
  const moves: Array<{ kind: "common" | "delete" | "insert"; left?: number; right?: number }> = [];
  let row = left.length;
  let col = right.length;
  while (row > 0 || col > 0) {
    if (row > 0 && col > 0 && left[row - 1] === right[col - 1]) {
      moves.push({ kind: "common", left: row - 1, right: col - 1 });
      row -= 1;
      col -= 1;
    } else if (col > 0 && (row === 0 || table[row][col - 1] >= table[row - 1][col])) {
      moves.push({ kind: "insert", right: col - 1 });
      col -= 1;
    } else {
      moves.push({ kind: "delete", left: row - 1 });
      row -= 1;
    }
  }
  moves.reverse();
  const output: string[] = ["--- a/" + relativePath, "+++ b/" + relativePath];
  for (const move of moves) {
    if (move.kind === "common") {
      output.push(" " + left[move.left!]);
    } else if (move.kind === "delete") {
      output.push("-" + left[move.left!]);
    } else {
      output.push("+" + right[move.right!]);
    }
  }
  return output.join("\n") + "\n";
}

async function collectFiles(root: string, base: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const entries = await readdir(base, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && diffExcludes.has(entry.name)) continue;
    const entryPath = base + sep + entry.name;
    const relative = root ? root + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      for (const [name, content] of await collectFiles(relative, entryPath)) {
        files.set(name, content);
      }
    } else if (entry.isFile()) {
      files.set(normalizeDiffPath(relative), await readFile(entryPath, "utf8"));
    }
  }
  return files;
}

export async function generateUnifiedDiff(leftRoot: string, rightRoot: string): Promise<string> {
  const leftFiles = await collectFiles("", leftRoot);
  const rightFiles = await collectFiles("", rightRoot);
  const paths = new Set<string>([...leftFiles.keys(), ...rightFiles.keys()]);
  const sorted = Array.from(paths).sort();
  const chunks: string[] = [];
  for (const path of sorted) {
    const left = leftFiles.get(path);
    const right = rightFiles.get(path);
    if (left === undefined && right !== undefined) {
      chunks.push(unifiedFileDiff(path, "", right));
    } else if (left !== undefined && right === undefined) {
      chunks.push(unifiedFileDiff(path, left, ""));
    } else if (left !== undefined && right !== undefined && left !== right) {
      chunks.push(unifiedFileDiff(path, left, right));
    }
  }
  return chunks.join("");
}
