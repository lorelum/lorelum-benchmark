"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const InsightsVisualization = dynamic(() => import("./insights-visualization"), { ssr: false });

export function InsightsPanel({ reportId }: { reportId: string }) {
  const [opened, setOpened] = useState(false);
  return <section aria-label="Insights"><button onClick={() => setOpened(true)}>Open insights</button>{opened ? <InsightsVisualization reportId={reportId} /> : null}</section>;
}
