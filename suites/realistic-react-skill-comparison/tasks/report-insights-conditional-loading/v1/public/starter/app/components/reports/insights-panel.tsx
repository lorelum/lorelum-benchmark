"use client";

import { useState } from "react";
import { InsightsVisualization } from "./insights-visualization";

type InsightsPanelProps = { reportId: string };

// The starter preserves the interaction but includes the visualization in the
// route's initial client payload even before a member opens it.
export function InsightsPanel({ reportId }: InsightsPanelProps) {
  const [opened, setOpened] = useState(false);
  return <section aria-label="Insights"><button onClick={() => setOpened(true)}>Open insights</button>{opened ? <InsightsVisualization reportId={reportId} /> : null}</section>;
}
