import { InsightsPanel } from "@/components/reports/insights-panel";
import { DeterministicRepository, viewerFor } from "@/lib/repository";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ reportId: string }>; searchParams: Promise<{ as?: string }> }) {
  const { reportId } = await params;
  const { as } = await searchParams;
  const viewer = viewerFor(as === "guest" ? "empty" : "atlas");
  const report = await new DeterministicRepository().getReport(reportId);
  return <main><h1>{report.title}</h1><p>{report.series.join(", ")}</p>{viewer.canViewReports ? <InsightsPanel reportId={report.id} /> : <p data-testid="insights-unavailable">Insights are unavailable for this workspace.</p>}</main>;
}
