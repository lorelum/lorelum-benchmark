"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const Visualization = dynamic(() => import("./insights-visualization"));
const cache = new Map<string, readonly number[]>();

export function InsightsPanel({ reportId }: { reportId: string }) {
  const [opened, setOpened] = useState(false);
  const [series, setSeries] = useState<readonly number[] | undefined>();

  async function open() {
    if (!series) {
      const cached = cache.get(reportId);
      const current = cached ?? (await fetch(`/api/reports/${reportId}/insights`).then((response) => response.json())).series;
      cache.set(reportId, current);
      setSeries(current);
    }
    setOpened(true);
  }

  return <section aria-label="Insights"><button onClick={() => void open()}>Open insights</button>{opened ? <><button onClick={() => setOpened(false)}>Close insights</button>{series ? <Visualization reportId={reportId} series={series} /> : null}</> : null}</section>;
}
