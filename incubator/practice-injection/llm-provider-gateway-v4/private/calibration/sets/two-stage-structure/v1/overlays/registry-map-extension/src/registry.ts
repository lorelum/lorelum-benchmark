import { chatWithFirst } from "./first-provider";
import { chatWithHalo } from "./halo-provider";

export const providers = {
  first: { chat: chatWithFirst },
  halo: { chat: chatWithHalo },
};
