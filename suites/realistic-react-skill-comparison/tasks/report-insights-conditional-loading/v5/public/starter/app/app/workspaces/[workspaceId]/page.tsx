import { Overview } from "@/components/dashboard/overview";
import { QuotaPanel } from "@/components/dashboard/quota-panel";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { renderWorkspaceDashboard } from "@/lib/dashboard-runtime";
import { assertWorkspaceAccess, DeterministicRepository, viewerFor } from "@/lib/repository";

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const viewer = viewerFor(workspaceId);
  assertWorkspaceAccess(viewer, workspaceId);
  const model = await renderWorkspaceDashboard(new DeterministicRepository(), workspaceId);
  return <main><Overview workspace={model.workspace} /><QuotaPanel quota={model.quota} /><RecentProjects projects={model.projects} /></main>;
}
