import { useEffect, useState } from "react";
import { requestRawProjects } from "./directoryClient";

export function LoginPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);

  async function load(nextQuery = query) {
    setLoading(true);
    setError("");
    try {
      const response = await requestRawProjects(nextQuery);
      if (response.status !== 200) setError("暂时无法加载项目");
      else setProjects(response.body);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(""); }, []);

  return (
    <main>
      <section aria-labelledby="directory-title">
        <h1 id="directory-title">项目目录</h1>
        <label>搜索项目<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button onClick={() => void load()} disabled={loading}>搜索</button>
        {loading ? <p role="status">加载中...</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {error ? <button onClick={() => void load()}>重试</button> : null}
        {!loading && !error && projects.length === 0 ? <p>没有匹配的项目</p> : null}
        <ul>{projects.map((project) => <li key={project.id}>{project.name}</li>)}</ul>
      </section>
    </main>
  );
}
