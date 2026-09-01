import { chatWithFirst } from "./first-provider";
import { chatWithHalo } from "./halo-provider";
export async function chat(request: { tenant: string; message: string }) {
  const response = request.message.includes("halo") ? await chatWithHalo([]) : await chatWithFirst([]);
  return { content: response.content };
}
