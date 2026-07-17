import { createCommandIndex } from "./command-index";

export async function openCommandPalette(query: string): Promise<string[]> {
  return createCommandIndex(query);
}
