import { SIGNS, type PlanetPosition, type VedicChart } from "../shared/vedic-engine";

const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury",
  Libra: "Venus", Scorpio: "Mars", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

const PLANET_ZH: Record<string, string> = { Sun: "太阳", Moon: "月亮", Mars: "火星", Mercury: "水星", Jupiter: "木星", Venus: "金星", Saturn: "土星", Rahu: "罗喉", Ketu: "计都" };
const BENEFICS = new Set(["Jupiter", "Venus", "Mercury"]);
const MALEFICS = new Set(["Mars", "Saturn", "Rahu", "Ketu"]);

export type PrashnaDecision = {
  verdict: "可推进" | "条件性推进" | "建议暂缓";
  score: number;
  queryHouse: number;
  queryTheme: string;
  evidence: string[];
  constraints: string[];
  moonWindowHours: number;
  markdown: string;
};

function chooseQueryHouse(question: string) {
  const text = question.toLowerCase();
  if (/入职|录用|offer|面试|工作|职位|事业|申请|升职/.test(text)) return { house: 10, theme: "工作、申请或社会角色" };
  if (/恋爱|感情|伴侣|结婚|关系|复合/.test(text)) return { house: 7, theme: "关系、合作或承诺" };
  if (/钱|收入|财|付款|债|投资|交易/.test(text)) return { house: 2, theme: "资源、收入或价值交换" };
  if (/房|搬家|居住|家人|地产/.test(text)) return { house: 4, theme: "居住、家园或基础稳定" };
  if (/出行|出国|考试|学习|出版|法律/.test(text)) return { house: 9, theme: "远行、学习或程序性事项" };
  return { house: 1, theme: "提问者当前主动推进的事项" };
}

function findPlanet(chart: VedicChart, name: string) {
  return chart.planets.find(planet => planet.name === name);
}

function hasGrahaLink(chart: VedicChart, from: PlanetPosition | undefined, to: PlanetPosition | undefined) {
  if (!from || !to) return false;
  return chart.grahaDrishti.some(item => item.sourcePlanet === from.name && item.targetHouse === to.house)
    || chart.grahaDrishti.some(item => item.sourcePlanet === to.name && item.targetHouse === from.house)
    || from.house === to.house;
}

function houseSign(chart: VedicChart, house: number) {
  return chart.houses[house - 1]?.sign || SIGNS[0];
}

function isAngular(house: number) {
  return [1, 4, 7, 10].includes(house);
}

function isDifficult(house: number) {
  return [6, 8, 12].includes(house);
}

/**
 * 这是一套公开、可复算的基础 Prashna 评分，不冒充完整古典裁决或概率预测。
 * 它只使用本应用已经计算的 D1 整宫、上升主、问题宫主、月亮与 Graha Drishti。
 */
export function buildPrashnaDecision(chart: VedicChart, question = ""): PrashnaDecision {
  const { house: queryHouse, theme: queryTheme } = chooseQueryHouse(question);
  const ascLordName = SIGN_RULERS[chart.lagna.sign] || "";
  const queryLordName = SIGN_RULERS[houseSign(chart, queryHouse)] || "";
  const ascLord = findPlanet(chart, ascLordName);
  const queryLord = findPlanet(chart, queryLordName);
  const moon = findPlanet(chart, "Moon");
  const evidence: string[] = [];
  const constraints: string[] = [];
  let score = 0;

  if (hasGrahaLink(chart, ascLord, queryLord)) {
    score += 2;
    evidence.push(`上升主${PLANET_ZH[ascLordName] || ascLordName}与问题宫主${PLANET_ZH[queryLordName] || queryLordName}存在${ascLord?.house === queryLord?.house ? "同宫" : "可见 Graha Drishti"}连接`);
  } else {
    constraints.push(`上升主${PLANET_ZH[ascLordName] || ascLordName}与问题宫主${PLANET_ZH[queryLordName] || queryLordName}未见同宫或 Graha Drishti 连接`);
  }
  if (hasGrahaLink(chart, moon, queryLord)) {
    score += 1;
    evidence.push(`月亮（H${moon?.house}）与问题宫主形成可见连接，提问事项仍在当前盘面中被激活`);
  } else {
    constraints.push(`月亮（H${moon?.house}）未与问题宫主形成可见连接，推进信号不足`);
  }
  if (queryLord && isAngular(queryLord.house)) {
    score += 1;
    evidence.push(`问题宫主${PLANET_ZH[queryLordName] || queryLordName}位于角宫 H${queryLord.house}，事项具备外显推进条件`);
  }
  if (queryLord && isDifficult(queryLord.house)) {
    score -= 1;
    constraints.push(`问题宫主${PLANET_ZH[queryLordName] || queryLordName}位于 H${queryLord.house}，需先处理阻碍、成本或隐性条件`);
  }
  const occupants = chart.houses[queryHouse - 1]?.occupants || [];
  const beneficCount = occupants.filter(planet => BENEFICS.has(planet)).length;
  const maleficCount = occupants.filter(planet => MALEFICS.has(planet)).length;
  if (beneficCount) {
    score += beneficCount;
    evidence.push(`问题宫 H${queryHouse} 有${occupants.filter(planet => BENEFICS.has(planet)).map(planet => PLANET_ZH[planet] || planet).join("、")}入驻，增加可用资源或协调空间`);
  }
  if (maleficCount) {
    score -= maleficCount;
    constraints.push(`问题宫 H${queryHouse} 有${occupants.filter(planet => MALEFICS.has(planet)).map(planet => PLANET_ZH[planet] || planet).join("、")}入驻，代表执行压力或外部摩擦`);
  }
  if (ascLord && isDifficult(ascLord.house)) {
    score -= 1;
    constraints.push(`上升主${PLANET_ZH[ascLordName] || ascLordName}位于 H${ascLord.house}，提问者当前资源或主动性受限`);
  }
  if (moon && isDifficult(moon.house)) {
    score -= 1;
    constraints.push(`月亮位于 H${moon.house}，情绪、等待或信息不完全会放大不确定性`);
  }

  const verdict = score >= 2 ? "可推进" : score >= 0 ? "条件性推进" : "建议暂缓";
  const action = verdict === "可推进"
    ? "当前可推进，但应围绕问题宫主题先完成最关键的一步，并以现实反馈验证。"
    : verdict === "条件性推进"
      ? "当前可以推进，但须先补足上列制约条件；不要把一次反馈直接当作最终结论。"
      : "当前阻力信号较多，建议先排除上列制约、补齐信息或调整方案，再重新判断。";
  const moonWindowHours = Math.max(1, Math.round(((30 - (moon?.degreeInSign || 0)) / 13.176) * 24));
  const markdown = `## Prashna 裁决摘要\n\n> **当前裁决：${verdict}**（基础 D1 可复算评分 ${score >= 0 ? "+" : ""}${score}）\n> **事项映射：H${queryHouse} · ${queryTheme}**\n> **短期观察窗：约 ${moonWindowHours} 小时**，按月亮距当前星座末度与平均日行度估算；它用于观察下一次现实反馈，不是事件必然发生时间。\n\n**为何这样判断**\n${evidence.length ? evidence.map(item => `- ${item}`).join("\n") : "- 当前盘面没有足够的支持连接，因此不把模糊象征包装成正向结论。"}\n\n**需要先处理的条件**\n${constraints.length ? constraints.map(item => `- ${item}`).join("\n") : "- 未见本基础规则内的明显制约；仍以实际信息、资格和行动结果为准。"}\n\n**下一步**：${action}`;
  return { verdict, score, queryHouse, queryTheme, evidence, constraints, moonWindowHours, markdown };
}
