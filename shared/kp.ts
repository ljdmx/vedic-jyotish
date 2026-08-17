export const KP_DASHA_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"] as const;

const YEARS: Record<(typeof KP_DASHA_ORDER)[number], number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};

const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
] as const;

const NAKSHATRA_SPAN = 360 / 27;

export type KpSubLordRow = {
  index: number;
  nakshatra: string;
  starLord: string;
  subLord: string;
  start: number;
  end: number;
};

function norm(value: number) { const result = value % 360; return result < 0 ? result + 360 : result; }

function signDegree(value: number) {
  const sign = Math.floor(value / 30) + 1;
  const remainder = value % 30;
  return `S${sign} ${remainder.toFixed(3)}°`;
}

export function buildKp249Table(): KpSubLordRow[] {
  const rows: KpSubLordRow[] = [];
  NAKSHATRAS.forEach((nakshatra, nakshatraIndex) => {
    const starLord = KP_DASHA_ORDER[nakshatraIndex % KP_DASHA_ORDER.length];
    const firstSubIndex = KP_DASHA_ORDER.indexOf(starLord);
    let start = nakshatraIndex * NAKSHATRA_SPAN;
    KP_DASHA_ORDER.forEach((_, offset) => {
      const subLord = KP_DASHA_ORDER[(firstSubIndex + offset) % KP_DASHA_ORDER.length];
      const end = start + (NAKSHATRA_SPAN * YEARS[subLord]) / 120;
      let segmentStart = start;
      while (segmentStart < end - 0.000001) {
        const nextSignBoundary = (Math.floor(segmentStart / 30) + 1) * 30;
        const segmentEnd = Math.min(end, nextSignBoundary);
        rows.push({ index: rows.length + 1, nakshatra, starLord, subLord, start: Number(segmentStart.toFixed(6)), end: Number(segmentEnd.toFixed(6)) });
        segmentStart = segmentEnd;
      }
      start = end;
    });
  });
  return rows;
}

export function lookupKpSubLord(longitude: number) {
  const normalized = norm(longitude);
  const table = buildKp249Table();
  const row = table.find(item => normalized >= item.start - 0.000001 && normalized < item.end - 0.000001) || table[table.length - 1];
  return { ...row, longitude: Number(normalized.toFixed(6)), longitudeLabel: signDegree(normalized) };
}
