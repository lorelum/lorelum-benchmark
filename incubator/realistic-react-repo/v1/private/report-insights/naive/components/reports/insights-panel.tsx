"use client";

import { useState } from "react";
import { InsightsVisualization } from "./insights-visualization";

// Independently authored semantic control: it preserves the interaction but
// makes the visualization part of the initial authorized client payload.
export function InsightsPanel({ reportId }: { reportId: string }) {
  const [opened, setOpened] = useState(false);
  return <section aria-label="Insights"><button onClick={() => setOpened(true)}>Open insights</button>{opened ? <InsightsVisualization reportId={reportId} /> : null}</section>;
}
