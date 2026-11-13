/** Resolve the chat endpoint without interpreting pathname as an authority. */
export function modelEndpoint(baseUrl: string): URL {
  let base: URL;
  try { base = new URL(baseUrl); } catch { throw new Error("Invalid model endpoint"); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Invalid model endpoint");
  const endpoint = new URL(base.href);
  endpoint.pathname = `${base.pathname.replace(/\/+$/, "")}/chat/completions`;
  return endpoint;
}
