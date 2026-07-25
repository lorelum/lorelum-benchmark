"use client";

import InsightsVisualization from "./insights-visualization";
import { useEffect } from "react";

export function GuestInsightsLeak({ reportId }: { reportId: string }) {
  useEffect(() => { void fetch(`/api/reports/${reportId}/insights`); }, [reportId]);
  return <span hidden><InsightsVisualization reportId={reportId} /></span>;
}
