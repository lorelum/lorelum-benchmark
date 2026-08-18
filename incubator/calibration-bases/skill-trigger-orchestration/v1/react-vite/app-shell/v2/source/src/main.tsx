import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./Dashboard";
import "./styles.css";

declare global {
  interface Window {
    __unmountProjectOverview?: () => void;
  }
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);

window.__unmountProjectOverview = () => root.unmount();
