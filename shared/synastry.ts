import type { PlanetPosition, VedicChart } from "./vedic-engine";

const HOUSE_THEMES = ["自我", "资源", "表达", "家园", "创造", "修复", "关系", "转化", "信念", "事业", "社群", "内在"];

export type SynastryOverlay = { direction: "A→B" | "B→A"; planet: string; targetHouse: number; targetTheme: string; sign: string; degree: number };
export type SynastryDrishti = { direction: "A→B" | "B→A"; sourcePlanet: string; targetPlanet: string; aspectHouse: number; note: string };
export type MoonScreening = { aNakshatra: string; bNakshatra: string; taraDistance: number; note: string };

function signIndex(position: PlanetPosition) { return Math.floor(position.longitude / 30); }

function aspectHouses(planet: string) {
  if (planet === "Mars") return [4, 7, 8];
  if (planet === "Jupiter") return [5, 7, 9];
  if (planet === "Saturn") return [3, 7, 10];
  return [7];
}

function overlays(source: VedicChart, target: VedicChart, direction: SynastryOverlay["direction"]) {
  const targetLagnaSign = signIndex(target.lagna);
  return source.planets.map(planet => {
    const targetHouse = ((signIndex(planet) - targetLagnaSign + 12) % 12) + 1;
    return { direction, planet: planet.name, targetHouse, targetTheme: HOUSE_THEMES[targetHouse - 1], sign: planet.sign, degree: planet.degreeInSign };
  });
}

function directionalDrishti(source: VedicChart, target: VedicChart, direction: SynastryDrishti["direction"]) {
  const result: SynastryDrishti[] = [];
  source.planets.forEach(sourcePlanet => target.planets.forEach(targetPlanet => {
    const distanceHouse = ((signIndex(targetPlanet) - signIndex(sourcePlanet) + 12) % 12) + 1;
    if (aspectHouses(sourcePlanet.name).includes(distanceHouse)) {
      result.push({ direction, sourcePlanet: sourcePlanet.name, targetPlanet: targetPlanet.name, aspectHouse: distanceHouse, note: distanceHouse === 7 ? "对宫 Graha Drishti" : `特殊 Graha Drishti（第 ${distanceHouse} 宫）` });
    }
  }));
  return result;
}

function moonScreening(chartA: VedicChart, chartB: VedicChart): MoonScreening {
  const aMoon = chartA.planets.find(item => item.name === "Moon")!;
  const bMoon = chartB.planets.find(item => item.name === "Moon")!;
  const aIndex = Math.floor(aMoon.longitude / (360 / 27));
  const bIndex = Math.floor(bMoon.longitude / (360 / 27));
  const taraDistance = ((bIndex - aIndex + 27) % 27) + 1;
  return { aNakshatra: aMoon.nakshatra, bNakshatra: bMoon.nakshatra, taraDistance, note: "月宿差异仅作为情绪节律与日常适应的筛查层，不构成关系结论或总分。" };
}

export function calculateSynastry(chartA: VedicChart, chartB: VedicChart) {
  return {
    chartA: { lagna: chartA.lagna.sign, moon: chartA.summary.moonSign },
    chartB: { lagna: chartB.lagna.sign, moon: chartB.summary.moonSign },
    overlays: [...overlays(chartA, chartB, "A→B"), ...overlays(chartB, chartA, "B→A")],
    drishti: [...directionalDrishti(chartA, chartB, "A→B"), ...directionalDrishti(chartB, chartA, "B→A")],
    moonScreening: moonScreening(chartA, chartB),
    methodology: "仅使用整宫投射、Graha Drishti 和月宿筛查；不使用西方 orb 相位、合成盘或单一匹配总分。",
  };
}
