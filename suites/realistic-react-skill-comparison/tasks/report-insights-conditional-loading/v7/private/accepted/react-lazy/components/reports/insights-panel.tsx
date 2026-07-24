"use client";

import { lazy, Suspense, useState } from "react";

const InsightsVisualization = lazy(() => import("./insights-visualization"));

export function InsightsPanel({ reportId }: { reportId: string }) {
  const [opened, setOpened] = useState(false);
  return <section aria-label="Insights"><button onClick={() => setOpened(true)}>Open insights</button>{opened ? <Suspense fallback={<p>Loading insights...</p>}><InsightsVisualization reportId={reportId} /></Suspense> : null}</section>;
}
