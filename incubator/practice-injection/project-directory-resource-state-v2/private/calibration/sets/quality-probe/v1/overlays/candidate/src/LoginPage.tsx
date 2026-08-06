import { useState } from "react";

export function LoginPage() {
  const [query, setQuery] = useState("");

  return (
    <main>
      <section aria-labelledby="directory-title">
        <h1 id="directory-title">项目目录</h1>
        <label>搜索项目<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button>搜索</button>
        <ul></ul>
      </section>
    </main>
  );
}