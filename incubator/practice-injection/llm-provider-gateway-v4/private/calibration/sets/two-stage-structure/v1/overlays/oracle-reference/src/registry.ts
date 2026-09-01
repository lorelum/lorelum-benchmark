import { chatWithFirst } from "./first-provider";
import { chatWithHalo } from "./halo-provider";
export const registry = { first: chatWithFirst, halo: chatWithHalo };
