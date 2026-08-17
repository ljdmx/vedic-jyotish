import { describe, expect, it } from "vitest";
import { calculateVedicChart } from "./vedic-engine";
import { selectSavedChart } from "./chart-selection";

describe("selectSavedChart", () => {
  it("retains persisted Graha Drishti evidence when an archived chart becomes the active work chart", () => {
    const chart = calculateVedicChart({ name: "Archive", date: "1990-08-15", time: "10:30", place: "Shanghai", latitude: 31.2304, longitude: 121.4737, timezoneOffset: 480 });
    const selected = selectSavedChart({ id: 12, label: "Archive", chartData: chart });
    expect(selected.chart.grahaDrishti).toEqual(chart.grahaDrishti);
    expect(selected.chart.grahaDrishti.some(item => item.sourcePlanet === "Mars")).toBe(true);
  });

  it("keeps historic chart records readable without inventing Graha Drishti evidence", () => {
    const chart = calculateVedicChart({ name: "Legacy", date: "1990-08-15", time: "10:30", place: "Shanghai", latitude: 31.2304, longitude: 121.4737, timezoneOffset: 480 });
    const { grahaDrishti: _removed, ...legacyChart } = chart;
    const selected = selectSavedChart({ id: 13, label: "Legacy", chartData: legacyChart });
    expect(selected.chart.grahaDrishti).toEqual([]);
  });
});
