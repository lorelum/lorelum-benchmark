export interface Viewer { id: string | null; canExport: boolean; }
export interface Report { id: string; title: string; exportsEnabled: boolean; }
export interface ExportRenderer { render(report: Report): Promise<string>; }
export interface ReportController { summary(): { id: string; title: string; canOpenExport: boolean }; openExport(): Promise<string | null>; }
export function createReportController(viewer: Viewer, report: Report, loadRenderer: () => Promise<ExportRenderer>): ReportController { const allowed = Boolean(viewer.id && viewer.canExport && report.exportsEnabled); let renderer: Promise<ExportRenderer> | undefined; return { summary: () => ({ id: report.id, title: report.title, canOpenExport: allowed }), async openExport() { if (!allowed) return null; renderer ??= loadRenderer(); return (await renderer).render(report); } }; }
