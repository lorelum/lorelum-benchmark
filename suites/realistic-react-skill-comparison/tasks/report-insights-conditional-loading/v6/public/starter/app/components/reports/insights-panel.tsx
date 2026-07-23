"use client";

import { useState } from "react";
import InsightsVisualization from "./insights-visualization";

type InsightsPanelProps = { reportId: string };

export function InsightsPanel({ reportId }: InsightsPanelProps) {
  const [opened, setOpened] = useState(false);
  return <section aria-label="Insights"><button onClick={() => setOpened(true)}>Open insights</button>{opened ? <InsightsVisualization reportId={reportId} /> : null}</section>;
}
