export interface Viewer { id: string | null; canExport: boolean; }
export interface Report { id: string; title: string; exportsEnabled: boolean; }
export type ExportFormat = "csv" | "pdf";
export interface ExportPolicy { csvEnabled: boolean; pdfEnabled: boolean; }
export interface ExportRenderer { render(report: Report, format: ExportFormat): Promise<string>; }
export interface ReportController { summary(): { id: string; title: string; canOpenExport: boolean }; openExport(format: ExportFormat): Promise<string | null>; }
export function createReportController(_viewer: Viewer, _report: Report, _policy: ExportPolicy, _load: (format: ExportFormat) => Promise<ExportRenderer>): ReportController { throw new Error("TODO"); }
