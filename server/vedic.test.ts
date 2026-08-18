import { describe, expect, it } from "vitest";
import { calculatePrashnaChart, calculateTajikaChart, calculateVedicChart, compactChartForPrompt } from "../shared/vedic-engine";
import { buildKp249Table, lookupKpSubLord } from "../shared/kp";
import { buildRectificationCandidates, summarizeRectificationCandidates } from "../shared/rectification";
import { calculateSynastry } from "../shared/synastry";
import { selectSavedChart } from "../shared/chart-selection";
import { buildP1P12Continuation, hasCompleteP1P12Report, moduleTitle } from "./vedic";

const testBirth = { name: "Test", date: "1990-08-15", time: "10:30", place: "Shanghai", latitude: 31.2304, longitude: 121.4737, timezoneOffset: 480, timeAccuracy: "精确到分钟" };

describe("vedic chart engine", () => {
  it("creates a complete whole-sign chart with all required positions", () => {
    const chart = calculateVedicChart(testBirth);
    expect(chart.planets).toHaveLength(9);
    expect(chart.houses).toHaveLength(12);
    expect(chart.lagna.house).toBe(1);
    expect(chart.planets.every(p => p.house >= 1 && p.house <= 12)).toBe(true);
    expect(chart.planets.every(p => p.pada >= 1 && p.pada <= 4)).toBe(true);
    expect(Math.abs(chart.planets.find(p => p.name === "Rahu")!.longitude - chart.planets.find(p => p.name === "Ketu")!.longitude)).toBeCloseTo(180, 1);
    expect(chart.grahaDrishti.filter(item => item.sourcePlanet === "Mars").map(item => item.aspectDistanceHouse).sort()).toEqual([4, 7, 8]);
    expect(chart.grahaDrishti.filter(item => item.sourcePlanet === "Jupiter").map(item => item.aspectDistanceHouse).sort()).toEqual([5, 7, 9]);
    expect(chart.grahaDrishti.filter(item => item.sourcePlanet === "Saturn").map(item => item.aspectDistanceHouse).sort((a, b) => a - b)).toEqual([3, 7, 10]);
    expect(chart.grahaDrishti.every(item => item.targetHouse >= 1 && item.targetHouse <= 12)).toBe(true);
    expect(compactChartForPrompt(chart).grahaDrishti).toContain("Mars");
    expect(chart.audit.source).toBe("direct_birth_input");
    expect(chart.audit.calculationScope).toContain("D1 whole-sign");
    expect(chart.audit.excludedFromThisChart).toContain("原生 MD/AD/PD");
  });

  it("uses China Standard Time for 1995 Kunming and yields a sidereal Scorpio ascendant", () => {
    const chart = calculateVedicChart({ name: "Kunming 1995", date: "1995-02-09", time: "14:04", place: "云南昆明", latitude: 25.243, longitude: 103.124, timezoneOffset: 480, timeAccuracy: "精确到分钟", timeBasis: "wall_clock" });
    expect(chart.calculatedAt).toBe("1995-02-09T06:04:00.000Z");
    expect(chart.lagna).toMatchObject({ sign: "Scorpio", signZh: "天蝎" });
    expect(chart.lagna.longitude).toBeCloseTo(231.79, 1);
  });

  it("keeps Prashna chart creation independent from a natal birth date", () => {
    const chart = calculatePrashnaChart({ name: "Prashna", place: "Shanghai", latitude: 31.2304, longitude: 121.4737, timezoneOffset: 480 });
    expect(chart.chartType).toBe("prashna");
    expect(chart.birth.name).toBe("Prashna");
    expect(chart.birth.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(chart.audit.source).toBe("current_question_time");
    expect(chart.audit.timeSource).toBe("系统时钟");
  });

  it("finds a solar-return work point for Tajika reports", () => {
    const solarReturn = calculateTajikaChart(testBirth, 2027);
    expect(solarReturn.chartType).toBe("tajika");
    expect(solarReturn.solarReturn?.utc).toContain("2027");
    expect(solarReturn.solarReturn?.longitudeDeviationArcMinutes).toBeLessThan(0.2);
  });

  it("labels the requested module in Chinese", () => {
    expect(moduleTitle("kp")).toBe("KP 1–249 资料核对");
    expect(moduleTitle("unknown")).toBe("吠陀占星分析");
  });

  it("accepts only a complete twelve-house P1–P12 report", () => {
    const complete = Array.from({ length: 12 }, (_, index) => `### P${index + 1}：第${index + 1}宫\n- 盘面观察`).join("\n\n");
    const truncated = Array.from({ length: 8 }, (_, index) => `### P${index + 1}：第${index + 1}宫`).join("\n");
    expect(hasCompleteP1P12Report(complete, "stop")).toBe(true);
    expect(hasCompleteP1P12Report(truncated, "stop")).toBe(false);
    expect(hasCompleteP1P12Report(complete, "length")).toBe(false);
  });

  it("仅追加重试稿中首稿缺失的 P1–P12 小节，不从 P1 重写", () => {
    const firstPass = Array.from({ length: 8 }, (_, index) => `### P${index + 1}：第${index + 1}宫\n- 首稿内容`).join("\n\n");
    const retryPass = Array.from({ length: 12 }, (_, index) => `### P${index + 1}：第${index + 1}宫\n- 重试内容`).join("\n\n");
    const continuation = buildP1P12Continuation(firstPass, retryPass);

    expect(continuation).toContain("### P9：第9宫");
    expect(continuation).toContain("### P12：第12宫");
    expect(continuation).not.toContain("### P1：第1宫");
  });

  it("builds a complete ordered KP 1–249 sub-lord table", () => {
    const table = buildKp249Table();
    expect(table).toHaveLength(249);
    expect(table[0]).toMatchObject({ index: 1, nakshatra: "Ashwini", starLord: "Ketu", subLord: "Ketu" });
    expect(table[248].index).toBe(249);
    const match = lookupKpSubLord(0.1);
    expect(match.index).toBe(1);
  });

  it("creates distinct time candidates without asserting an answer", () => {
    const candidates = buildRectificationCandidates({ ...testBirth, timeAccuracy: "±15分钟" });
    const summary = summarizeRectificationCandidates(candidates);
    expect(candidates).toHaveLength(5);
    expect(candidates.map(item => item.localTime)).toContain("10:30");
    expect(summary.candidateCount).toBe(5);
  });

  it("calculates directional Parashari overlays and Graha Drishti for two charts", () => {
    const chartA = calculateVedicChart(testBirth);
    const chartB = calculateVedicChart({ ...testBirth, name: "Partner", date: "1992-01-12", time: "18:45", place: "Delhi", latitude: 28.6139, longitude: 77.209, timezoneOffset: 330 });
    const result = calculateSynastry(chartA, chartB);
    expect(result.overlays).toHaveLength(18);
    expect(result.drishti.every(item => item.aspectHouse >= 1 && item.aspectHouse <= 12)).toBe(true);
    expect(result.moonScreening.taraDistance).toBeGreaterThanOrEqual(1);
    expect(result.methodology).toContain("不使用西方");
  });

  it("keeps Graha Drishti when an archived chart is selected as the active work chart", () => {
    const chart = calculateVedicChart(testBirth);
    const selected = selectSavedChart({ id: 88, label: "Archive", chartData: chart });
    expect(selected.chart.grahaDrishti).toEqual(chart.grahaDrishti);
    const { grahaDrishti: _removed, ...legacyChart } = chart;
    expect(selectSavedChart({ id: 89, label: "Legacy", chartData: legacyChart }).chart.grahaDrishti).toEqual([]);
  });
});
