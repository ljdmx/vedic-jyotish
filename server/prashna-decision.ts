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
  plainEvidence: string[];
  plainConstraints: string[];
  moonWindowHours: number;
  streamSegments: string[];
  markdown: string;
};

function chooseQueryHouse(question: string) {
  const text = question.toLowerCase();
  if (/入职|录用|offer|面试|工作|职位|事业|申请|升职/.test(text)) return { house: 10, theme: "这次工作或申请的进展" };
  if (/恋爱|感情|伴侣|结婚|关系|复合/.test(text)) return { house: 7, theme: "这段关系或合作是否能往前走" };
  if (/钱|收入|财|付款|债|投资|交易/.test(text)) return { house: 2, theme: "这笔钱、收入或资源能否落实" };
  if (/房|搬家|居住|家人|地产/.test(text)) return { house: 4, theme: "搬家、住房或家庭安排是否稳定" };
  if (/出行|出国|考试|学习|出版|法律/.test(text)) return { house: 9, theme: "出行、学习或手续是否能推进" };
  return { house: 1, theme: "你现在主动在推进的这件事" };
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
  const plainEvidence: string[] = [];
  const plainConstraints: string[] = [];
  let score = 0;

  if (hasGrahaLink(chart, ascLord, queryLord)) {
    score += 2;
    evidence.push(`上升主${PLANET_ZH[ascLordName] || ascLordName}与问题宫主${PLANET_ZH[queryLordName] || queryLordName}存在${ascLord?.house === queryLord?.house ? "同宫" : "可见 Graha Drishti"}连接`);
    plainEvidence.push("你能动用的条件，和这件事本身有直接关联；主动推进是有用的。");
  } else {
    constraints.push(`上升主${PLANET_ZH[ascLordName] || ascLordName}与问题宫主${PLANET_ZH[queryLordName] || queryLordName}未见同宫或 Graha Drishti 连接`);
    plainConstraints.push("你这边的准备和事情需要的关键条件还没接上，先补这一环会更有效。 ");
  }
  if (hasGrahaLink(chart, moon, queryLord)) {
    score += 1;
    evidence.push(`月亮（H${moon?.house}）与问题宫主形成可见连接，提问事项仍在当前盘面中被激活`);
    plainEvidence.push("这件事仍有后续变化，不是已经完全定局的状态。");
  } else {
    constraints.push(`月亮（H${moon?.house}）未与问题宫主形成可见连接，推进信号不足`);
    plainConstraints.push("眼下还没有足够的后续信号，别只凭一次消息就下最终判断。 ");
  }
  if (queryLord && isAngular(queryLord.house)) {
    score += 1;
    evidence.push(`问题宫主${PLANET_ZH[queryLordName] || queryLordName}位于角宫 H${queryLord.house}，事项具备外显推进条件`);
    plainEvidence.push("这件事容易从想法变成看得见的进展，适合把下一步说清、做实。 ");
  }
  if (queryLord && isDifficult(queryLord.house)) {
    score -= 1;
    constraints.push(`问题宫主${PLANET_ZH[queryLordName] || queryLordName}位于 H${queryLord.house}，需先处理阻碍、成本或隐性条件`);
    plainConstraints.push("真正的难点不在表面，要先把成本、等待或隐藏条件处理掉。 ");
  }
  const occupants = chart.houses[queryHouse - 1]?.occupants || [];
  const beneficCount = occupants.filter(planet => BENEFICS.has(planet)).length;
  const maleficCount = occupants.filter(planet => MALEFICS.has(planet)).length;
  if (beneficCount) {
    score += beneficCount;
    evidence.push(`问题宫 H${queryHouse} 有${occupants.filter(planet => BENEFICS.has(planet)).map(planet => PLANET_ZH[planet] || planet).join("、")}入驻，增加可用资源或协调空间`);
    plainEvidence.push("这件事还有可协调的空间，找对人、补对材料或把话讲清楚会有帮助。 ");
  }
  if (maleficCount) {
    score -= maleficCount;
    constraints.push(`问题宫 H${queryHouse} 有${occupants.filter(planet => MALEFICS.has(planet)).map(planet => PLANET_ZH[planet] || planet).join("、")}入驻，代表执行压力或外部摩擦`);
    plainConstraints.push("过程里容易有摩擦或反复，先预留缓冲，不要把阻力当成完全否定。 ");
  }
  if (ascLord && isDifficult(ascLord.house)) {
    score -= 1;
    constraints.push(`上升主${PLANET_ZH[ascLordName] || ascLordName}位于 H${ascLord.house}，提问者当前资源或主动性受限`);
    plainConstraints.push("你现在的时间、精力或选择空间偏紧，先稳住自己的节奏。 ");
  }
  if (moon && isDifficult(moon.house)) {
    score -= 1;
    constraints.push(`月亮位于 H${moon.house}，情绪、等待或信息不完全会放大不确定性`);
    plainConstraints.push("现在的信息可能还不完整，先等一个明确回复或事实出现，再作决定。 ");
  }

  const verdict = score >= 2 ? "可推进" : score >= 0 ? "条件性推进" : "建议暂缓";
  const action = verdict === "可推进"
    ? "可以往前走。先把最关键的一步做完，再用现实反馈确认方向。"
    : verdict === "条件性推进"
      ? "可以动，但先把下面提到的卡点处理好；一次消息不等于最终结果。"
      : "先别急着定案。把下面的卡点解决、信息补齐后，再重新判断会更稳。";
  const moonWindowHours = Math.max(1, Math.round(((30 - (moon?.degreeInSign || 0)) / 13.176) * 24));
  const summary = `## 先说结论\n\n> **现在的建议：${verdict}**\n> **你在问：${queryTheme}**\n> **下一步：${action}**\n> **先观察：约 ${moonWindowHours} 小时内是否出现新的明确消息、进展或阻碍。**`;
  const reasons = `### 为什么这样说\n${plainEvidence.length ? plainEvidence.map(item => `- ${item}`).join("\n") : "- 当前盘面没有足够的支持连接，所以不把模糊感觉当成正向信号。"}`;
  const conditions = `### 先留意这些条件\n${plainConstraints.length ? plainConstraints.map(item => `- ${item.trim()}`).join("\n") : "- 目前没有看见基础规则内的明显卡点；仍以实际信息和行动结果为准。"}`;
  const technical = `### 想核对盘面再看这里\n- 本次对应的是第 ${queryHouse} 宫；基础评分 ${score >= 0 ? "+" : ""}${score}。\n${evidence.length ? evidence.map(item => `- ${item}`).join("\n") : "- 未找到足够的支持连接。"}\n${constraints.length ? constraints.map(item => `- ${item}`).join("\n") : "- 未找到基础规则内的明显制约。"}\n\n> 观察时间按月亮距当前星座末度和平均日行度估算，只用来等下一次现实反馈，不是事件必然发生的承诺。`;
  const streamSegments = [summary, reasons, conditions, technical];
  const markdown = streamSegments.join("\n\n");
  return { verdict, score, queryHouse, queryTheme, evidence, constraints, plainEvidence, plainConstraints, moonWindowHours, streamSegments, markdown };
}
