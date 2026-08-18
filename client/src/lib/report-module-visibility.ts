export function shouldShowModuleReport(input: {
  activeModule: string;
  reportModule: string | null;
  hasRenderableReport: boolean;
  isPending: boolean;
  hasFailure: boolean;
}) {
  return input.activeModule === input.reportModule && (input.hasRenderableReport || input.isPending || input.hasFailure);
}

export function reportsForModule<T extends { module: string }>(reports: T[], activeModule: string) {
  return reports.filter(report => report.module === activeModule);
}
