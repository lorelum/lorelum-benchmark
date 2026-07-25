"use client";

import { useEffect, useState, type ComponentType } from "react";

type Visualization = ComponentType<{ reportId: string }>;

export function InsightsPanel({ reportId }: { reportId: string }) {
  const [opened, setOpened] = useState(false);
  const [Visualization, setVisualization] = useState<Visualization | null>(null);
  // The module is split, but this mutation preloads it before a member asks.
  useEffect(() => { void import("./insights-visualization").then((module) => setVisualization(() => module.default)); }, []);
  return <section aria-label="Insights"><button onClick={() => setOpened(true)}>Open insights</button>{opened && !Visualization ? <p data-testid="insights-loading">Loading insights...</p> : null}{opened && Visualization ? <Visualization reportId={reportId} /> : null}</section>;
}
