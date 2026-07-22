"use client";

import { useState } from "react";

type InsightsPanelProps = { reportId: string; enabled: boolean };

export function InsightsPanel({ reportId, enabled }: InsightsPanelProps) {
  const [opened, setOpened] = useState(false);
  if (!enabled) return <p data-testid="insights-unavailable">Insights are unavailable for this workspace.</p>;
  return <section aria-label="Insights"><button onClick={() => setOpened(true)}>Open insights</button>{opened ? <p data-testid="insights-ready">Insights ready for {reportId}</p> : null}</section>;
}
