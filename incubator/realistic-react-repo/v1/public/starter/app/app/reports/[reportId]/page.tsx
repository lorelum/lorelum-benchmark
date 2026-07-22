import { InsightsPanel } from "@/components/reports/insights-panel";
import { DeterministicRepository, viewerFor } from "@/lib/repository";

export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const viewer = viewerFor("atlas");
  const report = await new DeterministicRepository().getReport(reportId);
  return <main><h1>{report.title}</h1><p>{report.series.join(", ")}</p><InsightsPanel reportId={report.id} enabled={viewer.canViewReports} /></main>;
}
