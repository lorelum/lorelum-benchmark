import { FormEvent, useEffect, useState } from "react";
import { loadProfile, updateProfile } from "./profileGateway";

export function LoginPage() {
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadProfile().then((profile) => setDisplayName(profile.displayName));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setMessage("");
    if (!displayName.trim()) {
      setError("显示名不能为空");
      return;
    }
    if (displayName.trim().length > 20) {
      setError("显示名不能超过 20 个字符");
      return;
    }

    setSubmitting(true);

    try {
      const result = await updateProfile(displayName.trim());
      if (result.kind === "name-taken") {
        setError("名称已被使用");
        return;
      }
      setDisplayName(result.profile.displayName);
      setMessage("资料已保存");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <section aria-labelledby="profile-title">
        <h1 id="profile-title">账户资料</h1>
        <form aria-busy={submitting} onSubmit={handleSubmit}>
          <label>
            显示名
            <input
              disabled={submitting}
              name="displayName"
              onChange={(event) => setDisplayName(event.target.value)}
              value={displayName}
            />
          </label>
          <button disabled={submitting} type="submit">{submitting ? "保存中..." : "保存"}</button>
        </form>
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
      </section>
    </main>
  );
}
