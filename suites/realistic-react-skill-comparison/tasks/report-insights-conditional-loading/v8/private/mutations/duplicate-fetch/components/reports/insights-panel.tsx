"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const Visualization = dynamic(() => import("./insights-visualization"));

export function InsightsPanel({ reportId }: { reportId: string }) {
  const [opened, setOpened] = useState(false);
  const [series, setSeries] = useState<readonly number[] | undefined>();

  async function open() {
    const payload = await fetch(`/api/reports/${reportId}/insights`).then((response) => response.json());
    setSeries(payload.series);
    setOpened(true);
  }

  return <section aria-label="Insights"><button onClick={() => void open()}>Open insights</button>{opened ? <><button onClick={() => setOpened(false)}>Close insights</button>{series ? <Visualization reportId={reportId} series={series} /> : null}</> : null}</section>;
}
