import type { VedicChart } from "./vedic-engine";

export type SavedChartSelection = { id: number; label: string; chartData: unknown };

/**
 * Converts an archived chart row into the active work-chart shape used by the UI.
 * Historic records that predate the Graha Drishti addition remain readable with an
 * explicit empty evidence list; new persisted records retain their original list.
 */
export function selectSavedChart(item: SavedChartSelection): { id: number; label: string; chart: VedicChart } {
  const raw = item.chartData as Partial<VedicChart>;
  return {
    id: item.id,
    label: item.label,
    chart: { ...raw, grahaDrishti: Array.isArray(raw.grahaDrishti) ? raw.grahaDrishti : [] } as VedicChart,
  };
}
