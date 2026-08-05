import { useReducer } from "react";
import { login } from "./api/session";

type State = { phase: "idle" | "pending"; notice: Awaited<ReturnType<typeof login>> | null };
const initialState: State = { phase: "idle", notice: null };
function reducer(state: State, action: { type: "pending" | "settled"; notice?: State["notice"] }): State {
  return action.type === "pending" ? { phase: "pending", notice: null } : { phase: "idle", notice: action.notice ?? null };
}
export function LoginPage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (state.phase === "pending") return;
    dispatch({ type: "pending" });
    const result = await login("email", "password");
    dispatch({ type: "settled", notice: result });
  }
  return <main><section aria-labelledby="login-title"><h1 id="login-title">管理控制台</h1>
    <form aria-busy={state.phase === "pending"} onSubmit={handleSubmit}>
      <label>邮箱<input disabled={state.phase === "pending"} type="email" /></label>
      <label>密码<input disabled={state.phase === "pending"} type="password" /></label>
      <button disabled={state.phase === "pending"} type="submit">登录</button>
    </form>
    {state.notice ? (state.notice.ok ? <p role="status">登录成功</p> : <p role="alert">{state.notice.message}</p>) : null}
  </section></main>;
}
