import { useEffect, useState } from "react";
import { queryDirectory, type DirectoryState } from "./directoryQuery";

export function LoginPage() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<DirectoryState>({ kind: "loading" });

  async function load(nextQuery = query) {
    setState({ kind: "loading" });
    setState(await queryDirectory(nextQuery));
  }

  useEffect(() => { void load(""); }, []);

  return (
    <main>
      <section aria-labelledby="directory-title">
        <h1 id="directory-title">项目目录</h1>
        <label>搜索项目<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button onClick={() => void load()} disabled={state.kind === "loading"}>搜索</button>
        {state.kind === "loading" ? <p role="status">加载中...</p> : null}
        {state.kind === "failed" ? <p role="alert">暂时无法加载项目</p> : null}
        {state.kind === "failed" ? <button onClick={() => void load()}>重试</button> : null}
        {state.kind === "empty" ? <p>没有匹配的项目</p> : null}
        {state.kind === "ready" ? <ul>{state.projects.map((project) => <li key={project.id}>{project.name}</li>)}</ul> : null}
      </section>
    </main>
  );
}
