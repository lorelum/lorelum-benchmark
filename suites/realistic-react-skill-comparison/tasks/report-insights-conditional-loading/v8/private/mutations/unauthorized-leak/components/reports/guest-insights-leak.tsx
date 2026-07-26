"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

const Visualization = dynamic(() => import("./insights-visualization"));

export function GuestInsightsLeak({ reportId }: { reportId: string }) {
  useEffect(() => { void fetch(`/api/reports/${reportId}/insights`); }, [reportId]);
  return <span hidden><Visualization reportId={reportId} /></span>;
}
