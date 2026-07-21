export interface Viewer { id: string | null; canExport: boolean; }
export interface Report { id: string; title: string; exportsEnabled: boolean; }
export interface ExportRenderer { render(report: Report): Promise<string>; }
export interface ReportController { summary(): { id: string; title: string; canOpenExport: boolean }; openExport(): Promise<string | null>; }

const inFlightRendererLoads = new Map<string, Promise<ExportRenderer>>();

export function createReportController(viewer: Viewer, report: Report, loadRenderer: () => Promise<ExportRenderer>): ReportController {
  const allowed = Boolean(viewer.id && viewer.canExport && report.exportsEnabled);
  return {
    summary: () => ({ id: report.id, title: report.title, canOpenExport: allowed }),
    async openExport() {
      if (!allowed) return null;
      let pending = inFlightRendererLoads.get(report.id);
      if (!pending) {
        pending = loadRenderer();
        inFlightRendererLoads.set(report.id, pending);
      }
      try {
        return await (await pending).render(report);
      } finally {
        if (inFlightRendererLoads.get(report.id) === pending) inFlightRendererLoads.delete(report.id);
      }
    }
  };
}
