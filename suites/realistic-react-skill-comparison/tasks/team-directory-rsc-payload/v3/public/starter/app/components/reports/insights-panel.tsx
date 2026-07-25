"use client";

import { useEffect, useState, type ComponentType } from "react";

type Visualization = ComponentType<{ reportId: string }>;

export function InsightsPanel({ reportId }: { reportId: string }) {
  const [opened, setOpened] = useState(false);
  const [Visualization, setVisualization] = useState<Visualization | null>(null);

  useEffect(() => {
    if (!opened || Visualization) return;
    void import("./insights-visualization").then((module) => setVisualization(() => module.InsightsVisualization));
  }, [opened, Visualization]);

  return <section aria-label="Insights"><button onClick={() => setOpened(true)}>Open insights</button>{opened && !Visualization ? <p data-testid="insights-loading">Loading insights...</p> : null}{Visualization ? <Visualization reportId={reportId} /> : null}</section>;
}
