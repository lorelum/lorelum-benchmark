import { useEffect, useState } from "react";
import { loadCatalog, type Catalog } from "./services/catalogQuery";

export function LoginPage() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<Catalog>({ state: "loading" });

  async function load(nextQuery = query) {
    setState({ state: "loading" });
    setState(await loadCatalog(nextQuery));
  }

  useEffect(() => { void load(""); }, []);

  return (
    <main>
      <section aria-labelledby="directory-title">
        <h1 id="directory-title">项目目录</h1>
        <label>搜索项目<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button onClick={() => void load()} disabled={state.state === "loading"}>搜索</button>
        {state.state === "loading" ? <p role="status">加载中...</p> : null}
        {state.state === "failed" ? <p role="alert">暂时无法加载项目</p> : null}
        {state.state === "failed" ? <button onClick={() => void load()}>重试</button> : null}
        {state.state === "empty" ? <p>没有匹配的项目</p> : null}
        {state.state === "ready" ? <ul>{state.items.map((project) => <li key={project.key}>{project.label}</li>)}</ul> : null}
      </section>
    </main>
  );
}
