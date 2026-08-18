import * as AstronomyImport from "astronomy-engine";

const Astronomy = ((AstronomyImport as unknown as { default?: typeof AstronomyImport }).default ?? AstronomyImport) as typeof AstronomyImport;

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;

export const SIGN_ZH: Record<(typeof SIGNS)[number], string> = {
  Aries: "白羊", Taurus: "金牛", Gemini: "双子", Cancer: "巨蟹", Leo: "狮子", Virgo: "处女",
  Libra: "天秤", Scorpio: "天蝎", Sagittarius: "射手", Capricorn: "摩羯", Aquarius: "水瓶", Pisces: "双鱼",
};

const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

const NAKSHATRA_RULERS = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"] as const;

const BODIES = [
  ["Sun", Astronomy.Body.Sun], ["Moon", Astronomy.Body.Moon], ["Mars", Astronomy.Body.Mars],
  ["Mercury", Astronomy.Body.Mercury], ["Jupiter", Astronomy.Body.Jupiter], ["Venus", Astronomy.Body.Venus],
  ["Saturn", Astronomy.Body.Saturn],
] as const;

export type BirthInput = {
  name?: string;
  date: string;
  time: string;
  place: string;
  latitude: number;
  longitude: number;
  timezoneOffset: number;
  timeAccuracy?: string;
  timeSource?: string;
  timeBasis?: "wall_clock" | "standard_time" | "unknown";
};

export type PlanetPosition = {
  name: string;
  longitude: number;
  tropicalLongitude: number;
  sign: string;
  signZh: string;
  degreeInSign: number;
  house: number;
  nakshatra: string;
  pada: number;
  nakshatraLord: string;
};

export type GrahaDrishti = {
  sourcePlanet: string;
  aspectDistanceHouse: number;
  targetHouse: number;
  targetSign: string;
  targetSignZh: string;
  targetOccupants: string[];
  kind: "对宫 Graha Drishti" | "特殊 Graha Drishti";
};

export type VedicChart = {
  birth: BirthInput;
  calculatedAt: string;
  chartType: "natal" | "prashna" | "tajika" | "synastry" | "kp";
  ayanamsa: { name: string; value: number; method: string };
  lagna: PlanetPosition;
  planets: PlanetPosition[];
  houses: Array<{ house: number; sign: string; signZh: string; occupants: string[]; theme: string }>;
  grahaDrishti: GrahaDrishti[];
  summary: { moonSign: string; sunSign: string; ascendantSign: string; moonNakshatra: string };
  solarReturn?: { utc: string; local: string; longitudeDeviationArcMinutes: number };
  audit: {
    source: "direct_birth_input" | "current_question_time" | "solar_return";
    timePrecision: string;
    timeSource: string;
    timeBasis: string;
    timezoneOffsetMinutes: number;
    calculationScope: string[];
    excludedFromThisChart: string[];
  };
};

const HOUSE_THEMES = ["自我与体质", "资源与价值", "表达与行动", "根基与家园", "创造与才华", "工作与修复", "关系与承诺", "转化与共享", "信念与远方", "事业与公众角色", "社群与愿景", "休息与潜意识"];

function norm(value: number) {
  const result = value % 360;
  return result < 0 ? result + 360 : result;
}

function deg(value: number) {
  return (value * Math.PI) / 180;
}

function rad(value: number) {
  return (value * 180) / Math.PI;
}

function utcDate(input: BirthInput) {
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute, second = 0] = input.time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - input.timezoneOffset * 60_000);
}

function julianDate(date: Date) {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

function ayanamsaLahiri(date: Date) {
  const centuries = (julianDate(date) - 2_451_545) / 36_525;
  return 23.8530556 + 1.3969713 * centuries + 0.0003086 * centuries * centuries;
}

function greenwichSiderealDegrees(date: Date) {
  const jd = julianDate(date);
  const t = (jd - 2_451_545) / 36_525;
  return norm(280.46061837 + 360.98564736629 * (jd - 2_451_545) + 0.000387933 * t * t - (t * t * t) / 38_710_000);
}

function ascendantLongitude(date: Date, latitude: number, longitude: number) {
  const t = (julianDate(date) - 2_451_545) / 36_525;
  const obliquity = 23.439291 - 0.0130042 * t;
  const lst = deg(norm(greenwichSiderealDegrees(date) + longitude));
  const phi = deg(latitude);
  const eps = deg(obliquity);
  return norm(rad(Math.atan2(-Math.cos(lst), Math.sin(lst) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))));
}

function meanNodeLongitude(date: Date) {
  const t = (julianDate(date) - 2_451_545) / 36_525;
  return norm(125.04452 - 1934.136261 * t + 0.0020708 * t * t + (t * t * t) / 450_000);
}

function makePosition(name: string, siderealLongitude: number, tropicalLongitude: number, ascendantSign: number): PlanetPosition {
  const signIndex = Math.floor(siderealLongitude / 30) % 12;
  const degreeInSign = siderealLongitude % 30;
  const nakshatraIndex = Math.min(26, Math.floor(siderealLongitude / (360 / 27)));
  const pada = Math.min(4, Math.floor((siderealLongitude % (360 / 27)) / (360 / 108)) + 1);
  return {
    name,
    longitude: Number(siderealLongitude.toFixed(4)),
    tropicalLongitude: Number(tropicalLongitude.toFixed(4)),
    sign: SIGNS[signIndex],
    signZh: SIGN_ZH[SIGNS[signIndex]],
    degreeInSign: Number(degreeInSign.toFixed(2)),
    house: ((signIndex - ascendantSign + 12) % 12) + 1,
    nakshatra: NAKSHATRAS[nakshatraIndex],
    pada,
    nakshatraLord: NAKSHATRA_RULERS[nakshatraIndex % 9],
  };
}

function drishtiDistances(planet: string) {
  if (planet === "Mars") return [4, 7, 8];
  if (planet === "Jupiter") return [5, 7, 9];
  if (planet === "Saturn") return [3, 7, 10];
  return [7];
}

function calculateGrahaDrishti(planets: PlanetPosition[], houses: VedicChart["houses"]): GrahaDrishti[] {
  return planets.flatMap(source => drishtiDistances(source.name).map(aspectDistanceHouse => {
    const targetHouse = ((source.house - 1 + aspectDistanceHouse - 1) % 12) + 1;
    const target = houses[targetHouse - 1]!;
    return {
      sourcePlanet: source.name,
      aspectDistanceHouse,
      targetHouse,
      targetSign: target.sign,
      targetSignZh: target.signZh,
      targetOccupants: target.occupants,
      kind: aspectDistanceHouse === 7 ? "对宫 Graha Drishti" : "特殊 Graha Drishti",
    };
  }));
}

export function calculateVedicChart(input: BirthInput, chartType: VedicChart["chartType"] = "natal"): VedicChart {
  const date = utcDate(input);
  const ayanamsa = ayanamsaLahiri(date);
  const tropicalAscendant = ascendantLongitude(date, input.latitude, input.longitude);
  const siderealAscendant = norm(tropicalAscendant - ayanamsa);
  const ascendantSign = Math.floor(siderealAscendant / 30) % 12;
  const lagna = makePosition("Lagna", siderealAscendant, tropicalAscendant, ascendantSign);

  const planets = BODIES.map(([name, body]) => {
    const tropical = Astronomy.Ecliptic(Astronomy.GeoVector(body, date, true)).elon;
    return makePosition(name, norm(tropical - ayanamsa), tropical, ascendantSign);
  });
  const rahuTropical = meanNodeLongitude(date);
  const rahu = makePosition("Rahu", norm(rahuTropical - ayanamsa), rahuTropical, ascendantSign);
  const ketu = makePosition("Ketu", norm(rahu.longitude + 180), norm(rahuTropical + 180), ascendantSign);
  planets.push(rahu, ketu);

  const houses = Array.from({ length: 12 }, (_, index) => {
    const sign = SIGNS[(ascendantSign + index) % 12];
    return {
      house: index + 1,
      sign,
      signZh: SIGN_ZH[sign],
      occupants: planets.filter(planet => planet.house === index + 1).map(planet => planet.name),
      theme: HOUSE_THEMES[index],
    };
  });
  const moon = planets.find(planet => planet.name === "Moon")!;
  const sun = planets.find(planet => planet.name === "Sun")!;
  const grahaDrishti = calculateGrahaDrishti(planets, houses);

  return {
    birth: input,
    calculatedAt: date.toISOString(),
    chartType,
    ayanamsa: { name: "Chitrapaksha / Lahiri 系动态近似", value: Number(ayanamsa.toFixed(5)), method: "应用内以地心黄道位置、Mean Node、全宫制与动态 ayanamsa 近似建立工作盘；专业级分盘、Shadbala、SAV/BAV 与原生 Dasha 未在此工作盘中生成。" },
    lagna,
    planets,
    houses,
    grahaDrishti,
    summary: { moonSign: moon.sign, sunSign: sun.sign, ascendantSign: lagna.sign, moonNakshatra: moon.nakshatra },
    audit: {
      source: chartType === "prashna" ? "current_question_time" : chartType === "tajika" ? "solar_return" : "direct_birth_input",
      timePrecision: input.timeAccuracy || (chartType === "prashna" ? "系统捕获到秒" : "未标注"),
      timeSource: input.timeSource || (chartType === "prashna" ? "系统时钟" : "未追问"),
      timeBasis: input.timeBasis || "unknown",
      timezoneOffsetMinutes: input.timezoneOffset,
      calculationScope: ["D1 whole-sign", "Lagna", "七曜 + Mean Rahu/Ketu", "Nakshatra/Pada", "Parāśari Graha Drishti", "年度太阳回归（Tajika）"],
      excludedFromThisChart: ["PyJHora Shadbala", "SAV/BAV", "原生 MD/AD/PD", "D9/D10/D4/D5 稳定性审计", "Chara Karaka/UL/AL"],
    },
  };
}

export function calculatePrashnaChart(location: Omit<BirthInput, "date" | "time">) {
  const now = new Date();
  const localMs = now.getTime() + location.timezoneOffset * 60_000;
  const local = new Date(localMs);
  const date = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
  const time = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}:${String(local.getUTCSeconds()).padStart(2, "0")}`;
  return calculateVedicChart({ ...location, name: "Prashna", date, time, timeAccuracy: "系统捕获到秒", timeSource: "系统时钟", timeBasis: "wall_clock" }, "prashna");
}

export function calculateTajikaChart(input: BirthInput, year: number) {
  const targetLongitude = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Sun, utcDate(input), true)).elon;
  const [month, day] = input.date.split("-").slice(1).map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  const center = new Date(Date.UTC(year, month - 1, day, hour, minute) - input.timezoneOffset * 60_000);
  const difference = (date: Date) => {
    const longitude = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Sun, date, true)).elon;
    return Math.abs(norm(longitude - targetLongitude + 180) - 180);
  };
  let best = center;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let hours = -96; hours <= 96; hours += 2) {
    const candidate = new Date(center.getTime() + hours * 3_600_000);
    const delta = difference(candidate);
    if (delta < bestDelta) { best = candidate; bestDelta = delta; }
  }
  let windowStart = new Date(best.getTime() - 3 * 3_600_000);
  let windowEnd = new Date(best.getTime() + 3 * 3_600_000);
  for (let round = 0; round < 24; round++) {
    const oneThird = new Date(windowStart.getTime() + (windowEnd.getTime() - windowStart.getTime()) / 3);
    const twoThirds = new Date(windowEnd.getTime() - (windowEnd.getTime() - windowStart.getTime()) / 3);
    if (difference(oneThird) <= difference(twoThirds)) windowEnd = twoThirds;
    else windowStart = oneThird;
  }
  best = new Date((windowStart.getTime() + windowEnd.getTime()) / 2);
  bestDelta = difference(best);
  const local = new Date(best.getTime() + input.timezoneOffset * 60_000);
  const localDate = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
  const localTime = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  const chart = calculateVedicChart({ ...input, name: `${input.name || "本命盘"} · ${year} Solar Return`, date: localDate, time: localTime }, "tajika");
  return { ...chart, solarReturn: { utc: best.toISOString(), local: `${localDate} ${localTime}`, longitudeDeviationArcMinutes: Number((bestDelta * 60).toFixed(3)) } };
}

export function compactChartForPrompt(chart: VedicChart) {
  return {
    birth: { date: chart.birth.date, time: chart.birth.time, place: chart.birth.place, latitude: chart.birth.latitude, longitude: chart.birth.longitude, timezoneOffsetMinutes: chart.birth.timezoneOffset, timeAccuracy: chart.birth.timeAccuracy || "未标注", timeSource: chart.birth.timeSource || "未追问", timeBasis: chart.birth.timeBasis || "unknown" },
    ayanamsa: chart.ayanamsa.name,
    lagna: `${chart.lagna.sign} ${chart.lagna.degreeInSign}° · ${chart.lagna.nakshatra} p${chart.lagna.pada}`,
    planets: chart.planets.map(p => `${p.name}: ${p.sign} ${p.degreeInSign}° H${p.house} · ${p.nakshatra} p${p.pada}`).join("; "),
    houses: chart.houses.map(h => `H${h.house} ${h.sign} (${h.occupants.join(", ") || "—"})`).join("; "),
    grahaDrishti: chart.grahaDrishti.map(item => `${item.sourcePlanet} ${item.kind} H${item.targetHouse} ${item.targetSign} (${item.targetOccupants.join(", ") || "—"})`).join("; "),
    solarReturn: chart.solarReturn,
    audit: chart.audit,
  };
}
