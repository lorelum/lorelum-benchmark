import { chatWithHalo } from "./halo-provider";
export async function chat(request: { tenant: string; message: string }) {
  const response = await chatWithHalo([{ role: "user", content: request.message }]);
  return { content: response.content };
}
