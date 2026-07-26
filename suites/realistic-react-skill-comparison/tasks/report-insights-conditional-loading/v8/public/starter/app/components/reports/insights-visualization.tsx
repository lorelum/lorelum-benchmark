"use client";

export default function InsightsVisualization({ reportId, series = [] }: { reportId: string; series?: readonly number[] }) {
  return <p data-testid="insights-ready">Insights visualization ready for {reportId}: {series.join(",")}</p>;
}
