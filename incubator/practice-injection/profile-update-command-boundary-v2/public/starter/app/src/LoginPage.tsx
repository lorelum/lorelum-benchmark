import { useState } from "react";

export function LoginPage() {
  const [displayName, setDisplayName] = useState("");

  return (
    <main>
      <section aria-labelledby="profile-title">
        <h1 id="profile-title">账户资料</h1>
        <form>
          <label>
            显示名
            <input name="displayName" onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
          </label>
          <button type="submit">保存</button>
        </form>
      </section>
    </main>
  );
}