"use client";

export function InsightsVisualization({ reportId }: { reportId: string }) {
  return <p data-testid="insights-ready">Insights visualization ready for {reportId}</p>;
}
