import { calculateVedicChart, type BirthInput, type VedicChart } from "./vedic-engine";

export type RectificationCandidate = {
  offsetMinutes: number;
  localDate: string;
  localTime: string;
  chart: Pick<VedicChart, "lagna" | "summary" | "planets">;
  discriminator: string;
};

function adjustedBirth(input: BirthInput, offsetMinutes: number): BirthInput {
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  const originalUtc = Date.UTC(year, month - 1, day, hour, minute) - input.timezoneOffset * 60_000;
  const local = new Date(originalUtc + input.timezoneOffset * 60_000 + offsetMinutes * 60_000);
  return {
    ...input,
    date: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`,
    time: `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`,
  };
}

export function buildRectificationCandidates(input: BirthInput) {
  const accuracy = input.timeAccuracy || "不确定";
  const offsets = accuracy === "精确到分钟" ? [-10, -5, 0, 5, 10] : accuracy === "±15分钟" ? [-30, -15, 0, 15, 30] : [-60, -30, 0, 30, 60];
  return offsets.map(offsetMinutes => {
    const candidateInput = adjustedBirth(input, offsetMinutes);
    const fullChart = calculateVedicChart(candidateInput);
    const moon = fullChart.planets.find(item => item.name === "Moon")!;
    return {
      offsetMinutes,
      localDate: candidateInput.date,
      localTime: candidateInput.time,
      chart: { lagna: fullChart.lagna, summary: fullChart.summary, planets: fullChart.planets },
      discriminator: `Lagna ${fullChart.lagna.signZh} ${fullChart.lagna.degreeInSign}°；月亮 ${moon.signZh} ${moon.degreeInSign}° · ${moon.nakshatra} p${moon.pada}`,
    } satisfies RectificationCandidate;
  });
}

export function summarizeRectificationCandidates(candidates: RectificationCandidate[]) {
  const lagnaGroups = Array.from(new Set(candidates.map(item => item.chart.lagna.signZh)));
  const moonGroups = Array.from(new Set(candidates.map(item => item.chart.summary.moonNakshatra)));
  return {
    candidateCount: candidates.length,
    lagnaVariants: lagnaGroups,
    moonNakshatraVariants: moonGroups,
    requiresEventDiscrimination: lagnaGroups.length > 1 || moonGroups.length > 1,
    note: lagnaGroups.length > 1 ? "候选时间跨越上升变化，事件材料可能具备结构区分力。" : "候选时间在当前扫描范围内保持相同上升；需优先依赖更精细的时间/事件材料，而非夸大候选差异。",
  };
}
