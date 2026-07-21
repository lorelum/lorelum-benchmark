export interface Viewer { id: string | null; canExport: boolean; }
export interface Report { id: string; title: string; exportsEnabled: boolean; }
export interface ExportRenderer { render(report: Report): Promise<string>; }
export interface ReportController { summary(): { id: string; title: string; canOpenExport: boolean }; openExport(): Promise<string | null>; }

export function createReportController(viewer: Viewer, report: Report, loadRenderer: () => Promise<ExportRenderer>): ReportController {
  return {
    summary: () => ({ id: report.id, title: report.title, canOpenExport: Boolean(viewer.id && viewer.canExport && report.exportsEnabled) }),
    async openExport() {
      const renderer = await loadRenderer();
      return viewer.id && viewer.canExport && report.exportsEnabled ? renderer.render(report) : null;
    }
  };
}
