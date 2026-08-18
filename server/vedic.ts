import { calculatePrashnaChart, calculateTajikaChart, calculateVedicChart, compactChartForPrompt, type BirthInput, type VedicChart } from "../shared/vedic-engine";
import type { TemporaryModelConfig } from "../shared/model-config";
import { extractCompatibleText, invokeCompatibleModel, streamCompatibleModel } from "./model-provider";

export type AnalysisStack = "natal" | "prashna" | "tajika" | "kp" | "synastry" | "rectification" | "document";

const STACK_BOUNDARIES: Record<AnalysisStack, string> = {
  natal: "只基于所提供的本命盘数据进行解读。不可借用 Prashna、Tajika 或 KP 的规则与结论。",
  prashna: "这是完全独立的 Prashna 标准层。只使用当前单一问题、捕获的起盘时刻、地点和时盘白名单结构；绝不可读取或引用任何本命盘、旧报告、关系盘、KP 或 Tajika 信息。默认层不使用 Dasha、SAV/BAV、Chara Karaka、完整分盘、过运或生产级日期。",
  tajika: "这是 Tajika / Solar Return 叠加层。只能在明确呈现本命盘与年度回归盘的比较处给结论，不要把年度判断当作终身本命结构。",
  kp: "这是独立的 KP Horary 栈。仅使用用户明确给出的 1–249 号码、对应子主星表行和用户提供的 KP cuspal/significator 材料；不要读取或混用 Parashari 本命盘、Prashna 标准层或 Tajika。若缺少关键 KP cuspal 数据，只能说明缺口与下一步，不得臆造 promise 或 timing。",
  synastry: "这是双人关系盘。必须分别陈述 A 与 B 的结构，再讨论关系交点；A→B 与 B→A 必须分开。仅使用整宫投射、Graha Drishti 和月宿筛查；不得使用西方 orb 相位、composite 合成盘或单一匹配总分。",
  rectification: "这是出生时间校准流程。人生事件仅是待验证材料，不得倒推出盘面结论。输出候选、证据支持、反证与仍需验证的信息；不得宣称已经确认分钟级精度。",
  document: "这是从用户上传的盘面资料中提取结构化信息的任务。只提取看得到或可可靠推断的字段；把无法确认的字段放入 missingFields，不得补写未知度数。",
};

const MODULE_PROTOCOLS: Record<string, string> = {
  p1p12: "这是 D1 十二宫基础概览，不是技能包定义的完整 P1–P12 行星审计。仅根据可用 D1 工作盘逐宫写出 P1–P12。必须严格按 P1、P2、P3……P12 的顺序完整输出十二个小节，任何情况下不得停在中途或省略 P9–P12。每宫采用紧凑格式：白话含义、盘面观察、可能呈现、限制/反证、现实验证问题，每项控制在 1–2 句、总计不超过约 220 个汉字；若输出预算紧张，优先进一步压缩单宫文字，也绝不删除宫位。开头“数据与边界”不超过 180 个汉字。未在审计范围的 Dasha、SAV/BAV、Shadbala、分盘、Karaka 与 Yoga 必须明确为不可用，不可暗示其结论。",
  career: "职业建议只能由当前工作盘中可见的第10宫、10宫星座、宫内星、对应行星落宫与 Graha Drishti（如提供）引出。输出赛道特征、推进方式、组织形态、变现路径，不将其压缩为唯一职业。D10、格局、Shadbala、Dasha 未提供时，标记为未计算而不是替代计算。",
  love: "关系专题只根据当前工作盘的第7宫、其星座、宫内星、Venus/Moon 和可见整宫关系写作。先写可能的互动节律，再列限制与现实验证点；不根据用户愿望制造确定关系结果，也不编造 DK、UL、D9 或 Dasha。",
  rectification: "必须先列出报时来源、墙钟/标准时、时间精度和事件数量。将每个候选保持并列，按“带日期事件（硬证据）”与“特质（辅证）”分表；没有至少5个独立事件、或现有工作盘未包含 D9/D10 换座审计时，结论只能是初步候选比较，不能宣称已校准至分钟。",
  synastry: "按六维矩阵输出：情绪安全、吸引与亲密、沟通修复、长期承载、现实协作、当前时机。每一维分别列支持、制约、方向差异和现实验证点；月宿只作筛查。不要给单一分数，也不要读取任一人的私密叙事作为生成依据。",
  prashna: "固定输出：1.先说人话（当前基础时盘可核对什么、尚缺什么）；2.问题范围与输入稳定性；3.D1 白名单事实；4.Timing 状态（未启用）；5.规则账本状态；6.Moon 仅作背景；7.体系边界。当前应用未实现来源标签化 rule_id 账本、题型 A/B/C 和古典三档裁决，因此不得输出“成／悬／不成”、结果偏向或事件建议；必须明确说明需要完整标准层判定器。",
  tajika: "先分开列“本命基础”和“年度太阳回归工作点”，再仅讨论两者可观察的对照。年度层不得覆盖终身结构；当前没有 Tajika 十六 Yoga、deeptamsha 或 applying/separating 算法，因此不得命名或伪造该类规则，也不得称为完整 Tajika 判读。",
  kp: "先说明所选 1–249 编号的星宿、星主、子主与仍缺字段。当前应用未实现 Krishnamurti ayanamsa、号码 Asc、Placidus cusps、A/B/C/D significator、Ruling Planets、四级 period 或 KP timing；不得输出当前偏向、promise、denial 或时间结论。",
};

export function moduleTitle(module: string) {
  const titles: Record<string, string> = {
    p1p12: "P1–P12 D1 十二宫概览", career: "职业专项", love: "恋爱与伴侣专项", reader: "盘面识读", rectification: "出生时间候选比较", synastry: "双人合盘", prashna: "Prashna 基础时盘核对", tajika: "Tajika 年度回归工作点", kp: "KP 1–249 资料核对",
  };
  return titles[module] || "吠陀占星分析";
}

/**
 * 将影响解读可复核性的计算依据固定写入报告，而不依赖模型自行复述。
 * 这提升的是结论的可追溯性与输入质量透明度，不宣称能提高未来事件预测准确率。
 */
export function buildReportEvidenceLedger(input: Pick<Parameters<typeof generateAnalysis>[0], "stack" | "module" | "chart">) {
  const chart = input.chart;
  if (!chart) {
    return `## 计算依据与置信边界（系统记录）\n\n- **分析栈**：${input.stack}；模块：${moduleTitle(input.module)}。\n- **可用材料**：仅使用本次明确提交的独立资料，不补写缺失盘面字段。\n- **结论边界**：缺少可计算盘面或完整规则账本时，仅说明资料状态与下一步，不给出确定性预测。`;
  }
  const audit = chart.audit;
  const timeIsVerified = /精确到分钟|系统捕获到秒/.test(audit.timePrecision) && audit.timeBasis !== "unknown";
  const timeBoundary = timeIsVerified
    ? "当前时间精度可用于本应用 D1 工作盘；仍不等同于已完成分盘或时限判断审计。"
    : "出生时间精度或时制尚未完全确认；涉及 Lagna、宫位和时间性判断只能作为当前工作盘假设，需先核对报时来源与时区。";
  return `## 计算依据与置信边界（系统记录）\n\n- **输入时空**：${chart.birth.date} ${chart.birth.time} · ${chart.birth.place} · ${chart.birth.latitude.toFixed(4)}, ${chart.birth.longitude.toFixed(4)} · UTC${audit.timezoneOffsetMinutes >= 0 ? "+" : ""}${(audit.timezoneOffsetMinutes / 60).toFixed(2)}。\n- **时间质量**：${audit.timePrecision}；来源：${audit.timeSource}；时制：${audit.timeBasis}。${timeBoundary}\n- **计算口径**：${chart.ayanamsa.name}；${audit.calculationScope.join("、")}。\n- **未纳入计算**：${audit.excludedFromThisChart.join("、")}。\n- **阅读规则**：后文只能把可见盘面位置、宫位、月宿或 Graha Drishti 作为依据；资料未提供或未计算的项目必须标注为“未计算”，不得补全为确定结论。`;
}

function finaliseReport(content: string, input: Parameters<typeof generateAnalysis>[0]) {
  return `${buildReportEvidenceLedger(input)}\n\n${content}`;
}

const EVIDENCE_PROTOCOL = "每一条关键解读都要在同段用“依据：”明确引用输入中实际存在的行星位置、H 宫位、月宿或 Graha Drishti；不可用的数据直接写“未计算”。出生时间精度或时制不充分时，禁止把宫位或时限解释成确定事实。";

function fallbackReport(module: string, chart?: VedicChart) {
  const marker = chart ? `上升位于 **${chart.lagna.signZh}座**，月亮位于 **${chart.summary.moonSign}座**。` : "已建立本次独立分析会话。";
  return `## ${moduleTitle(module)}\n\n${marker}\n\nAI 解读服务当前未返回文本。你的输入与计算结果已保留在本次会话中；可稍后重新运行以生成完整的结构化解读。\n\n> 本应用提供的是占星信息整理与反思材料，不构成医疗、法律、投资或其他专业意见。`;
}

export function hasCompleteP1P12Report(content: string, finishReason?: string | null) {
  if (finishReason === "length") return false;
  return Array.from({ length: 12 }, (_, index) => index + 1).every(index => new RegExp(`(?:^|\\n)#{2,6}\\s*P${index}\\s*[：:]`, "m").test(content));
}

function p1P12Sections(content: string) {
  const headings = Array.from(content.matchAll(/^#{2,6}\s*P(\d+)\s*[：:].*$/gm));
  const sections = new Map<number, string>();
  headings.forEach((heading, index) => {
    const house = Number(heading[1]);
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? content.length;
    if (house >= 1 && house <= 12) sections.set(house, content.slice(start, end).trim());
  });
  return sections;
}

/**
 * 首稿不完整时，仅取重试稿中首稿缺失的宫位，以续写代替清屏后从 P1 重写。
 * 即便上游忽略“续写”指令重发完整报告，客户端也只收到尚缺小节。
 */
export function buildP1P12Continuation(firstPass: string, retryPass: string) {
  const existing = p1P12Sections(firstPass);
  const retry = p1P12Sections(retryPass);
  return Array.from({ length: 12 }, (_, index) => index + 1)
    .filter(house => !existing.has(house))
    .map(house => retry.get(house) || "")
    .filter(Boolean)
    .join("\n\n");
}

export async function generateAnalysis(input: {
  stack: AnalysisStack;
  module: string;
  question?: string;
  chart?: VedicChart;
  partnerChart?: VedicChart;
  tajikaChart?: VedicChart;
  events?: string;
  extraContext?: string;
  modelConfig?: TemporaryModelConfig;
}) {
  const data = {
    primaryChart: input.chart ? compactChartForPrompt(input.chart) : undefined,
    partnerChart: input.partnerChart ? compactChartForPrompt(input.partnerChart) : undefined,
    tajikaChart: input.tajikaChart ? compactChartForPrompt(input.tajikaChart) : undefined,
    events: input.events || undefined,
    question: input.question || undefined,
    extraContext: input.extraContext || undefined,
    systemEvidenceLedger: buildReportEvidenceLedger(input),
  };
  const system = `你是一名使用中文撰写、证据透明的吠陀占星研究助理。当前模块：${moduleTitle(input.module)}。${STACK_BOUNDARIES[input.stack]}
模块协议：${MODULE_PROTOCOLS[input.module] || "先说人话，再写可复核的盘面证据、限制/反证与可验证问题。"}
将盘面数据视为象征性解释框架，不要把推断包装为确定事实、诊断、治疗或绝对预测。不得编造缺失的天体、分盘、Dasha、KP cusp/sub-lord、出生事件、规则编号或数据源。
	所有报告都必须有“数据与边界”一节，明确引用输入 audit.calculationScope 与 audit.excludedFromThisChart；再使用“盘面观察”“可能呈现”“限制/反证”“现实验证问题”四种标签。语言比例约为70%通俗解释、20%可核对证据、10%技术注释，术语第一次出现要翻译。
	不要在列表项前使用 ✓ ✗ ✅ ❌ ✔ 等 emoji 字符作为「已包含 / 未计算」的标识；改用纯文字前缀如「（启用）」「（未计算）」「（未启用）」，让前端以一致视觉样式渲染。`;
  const evidenceSystem = `${system}\n${EVIDENCE_PROTOCOL}`;
  try {
    const result = await invokeCompatibleModel({
      selection: input.modelConfig,
      maxTokens: input.module === "p1p12" ? 6000 : undefined,
      messages: [
        { role: "system", content: evidenceSystem },
        { role: "user", content: `以下是经过计算或用户提供的数据。请仅据此完成当前模块，并保留不确定性：\n\n${JSON.stringify(data, null, 2)}` },
      ],
    });
    const content = extractCompatibleText(result);
    if (!content) return finaliseReport(fallbackReport(input.module, input.chart), input);
    if (input.module !== "p1p12" || hasCompleteP1P12Report(content, result.choices?.[0]?.finish_reason)) return finaliseReport(content, input);

    console.warn("[Vedic] P1–P12 response was incomplete; retrying with compact full-report instructions");
    const retry = await invokeCompatibleModel({
      selection: input.modelConfig,
      maxTokens: 6000,
      messages: [
        { role: "system", content: `${evidenceSystem}\n上一稿未能完整覆盖十二宫。现在请从头重写一份紧凑完整的 P1–P12 报告：必须包含从“### P1：”至“### P12：”的十二个标题，每宫最多 5 个简短条目；宁可压缩文字，也不能跳宫、停在半句或省略 P9–P12。` },
        { role: "user", content: `请仅使用以下数据重写完整 P1–P12 报告：\n\n${JSON.stringify(data, null, 2)}` },
      ],
    });
    const retryContent = extractCompatibleText(retry);
    return finaliseReport(retryContent && hasCompleteP1P12Report(retryContent, retry.choices?.[0]?.finish_reason)
      ? retryContent
      : fallbackReport(input.module, input.chart), input);
  } catch (error) {
    console.error("[Vedic] AI analysis failed", error);
    return finaliseReport(fallbackReport(input.module, input.chart), input);
  }
}

/** 流式生成事件的类型定义：delta 增量 / restart（遗留兼容）/ done 收尾。 */
export type AnalysisStreamEvent =
  | { type: "delta"; text: string }
  | { type: "restart" }
  | { type: "done" };

/**
 * 流式版本的 generateAnalysis：模型增量文本经 onEvent 实时转发。
 * P1–P12 首稿不完整时静默请求续写，并只转发缺失宫位，避免页面清空后从头重绘。
 * 重试也失败时保留已输出文本并追加明确的未完成说明。
 */
export async function generateAnalysisStream(
  input: Parameters<typeof generateAnalysis>[0],
  onEvent: (event: AnalysisStreamEvent) => void,
  signal?: AbortSignal
): Promise<string> {
  const data = {
    primaryChart: input.chart ? compactChartForPrompt(input.chart) : undefined,
    partnerChart: input.partnerChart ? compactChartForPrompt(input.partnerChart) : undefined,
    tajikaChart: input.tajikaChart ? compactChartForPrompt(input.tajikaChart) : undefined,
    events: input.events || undefined,
    question: input.question || undefined,
    extraContext: input.extraContext || undefined,
    systemEvidenceLedger: buildReportEvidenceLedger(input),
  };
  const system = `你是一名使用中文撰写、证据透明的吠陀占星研究助理。当前模块：${moduleTitle(input.module)}。${STACK_BOUNDARIES[input.stack]}
模块协议：${MODULE_PROTOCOLS[input.module] || "先说人话，再写可复核的盘面证据、限制/反证与可验证问题。"}
将盘面数据视为象征性解释框架，不要把推断包装为确定事实、诊断、治疗或绝对预测。不得编造缺失的天体、分盘、Dasha、KP cusp/sub-lord、出生事件、规则编号或数据源。
	所有报告都必须有“数据与边界”一节，明确引用输入 audit.calculationScope 与 audit.excludedFromThisChart；再使用“盘面观察”“可能呈现”“限制/反证”“现实验证问题”四种标签。语言比例约为70%通俗解释、20%可核对证据、10%技术注释，术语第一次出现要翻译。
	不要在列表项前使用 ✓ ✗ ✅ ❌ ✔ 等 emoji 字符作为「已包含 / 未计算」的标识；改用纯文字前缀如「（启用）」「（未计算）」「（未启用）」，让前端以一致视觉样式渲染。`;
  const evidenceSystem = `${system}\n${EVIDENCE_PROTOCOL}`;
  const userMessage = `以下是经过计算或用户提供的数据。请仅据此完成当前模块，并保留不确定性：\n\n${JSON.stringify(data, null, 2)}`;

  const evidenceLedger = buildReportEvidenceLedger(input);
  let emittedContent = `${evidenceLedger}\n\n`;
  onEvent({ type: "delta", text: emittedContent });
  const collect = async (messages: { role: "system" | "user" | "assistant"; content: unknown }[], maxTokens?: number, emit = true) => {
    let content = "";
    for await (const chunk of streamCompatibleModel({ selection: input.modelConfig, maxTokens, messages, signal })) {
      if (signal?.aborted) throw new Error("报告流已取消");
      content += chunk;
      if (emit) {
        emittedContent += chunk;
        onEvent({ type: "delta", text: chunk });
      }
    }
    return content;
  };

  try {
    const firstPass = await collect([
      { role: "system", content: evidenceSystem },
      { role: "user", content: userMessage },
    ], input.module === "p1p12" ? 6000 : undefined);
    if (firstPass && input.module !== "p1p12") return firstPass;
    if (firstPass && hasCompleteP1P12Report(firstPass)) return firstPass;

    console.warn("[Vedic] P1–P12 response was incomplete; requesting only missing sections without clearing the stream");
    const retryContent = await collect([
      { role: "system", content: `${evidenceSystem}\n上一稿已经显示给用户。只续写其中缺失的 P 宫标题和内容，绝不可重复“数据与边界”、已存在的标题或 P1–P8 等既有段落。每宫最多 5 个简短条目。` },
      { role: "user", content: `原始数据：\n\n${JSON.stringify(data, null, 2)}` },
      { role: "assistant", content: firstPass },
      { role: "user", content: "请从第一个尚未输出的 P 宫继续，直到 P12。" },
    ], 6000, false);
    const continuation = buildP1P12Continuation(firstPass, retryContent);
    if (continuation) {
      const appended = `\n\n${continuation}`;
      emittedContent += appended;
      onEvent({ type: "delta", text: appended });
      const combined = `${firstPass}${appended}`;
      if (hasCompleteP1P12Report(combined)) return combined;
    }

    const notice = "\n\n### 生成边界\n本次 P1–P12 续写未能补齐所有宫位；已保留已生成内容，可重新生成以取得完整版本。";
    emittedContent += notice;
    onEvent({ type: "delta", text: notice });
    return `${firstPass}${notice}`;
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error("[Vedic] AI streaming analysis failed", error);
    if (emittedContent) {
      const notice = "\n\n### 生成中断\n已保留已生成内容；可重新生成以取得完整版本。";
      onEvent({ type: "delta", text: notice });
      return `${emittedContent}${notice}`;
    }
    const fallback = fallbackReport(input.module, input.chart);
    onEvent({ type: "delta", text: fallback });
    return fallback;
  } finally {
    if (!signal?.aborted) onEvent({ type: "done" });
  }
}

export type DocumentField = { field: string; value: string; status: "已清晰识别" | "待人工确认" | "不可读取"; evidence: string };
export type DocumentExtraction = {
  summary: string;
  birthFields: DocumentField[];
  chartFields: DocumentField[];
  missingFields: string[];
  sourcePriority: { original: string; extractedFields: string; canonicalRule: string; confidence: "待确认" };
  markdown: string;
};

function escapeCell(value: string) { return value.replace(/\|/g, "\\|").replace(/\n/g, " "); }
function fieldsTable(title: string, fields: DocumentField[]) {
  if (!fields.length) return `### ${title}\n\n未识别到可可靠记录的字段。`;
  return `### ${title}\n\n| 字段 | 值 | 状态 | 识别依据 |\n| --- | --- | --- | --- |\n${fields.map(item => `| ${escapeCell(item.field)} | ${escapeCell(item.value)} | ${item.status} | ${escapeCell(item.evidence)} |`).join("\n")}`;
}
function renderDocumentExtraction(data: Omit<DocumentExtraction, "markdown">) {
  return `## 盘面资料提取\n\n${data.summary}\n\n${fieldsTable("出生资料", data.birthFields)}\n\n${fieldsTable("盘面字段", data.chartFields)}\n\n### 缺失与待补资料\n\n${data.missingFields.length ? data.missingFields.map(item => `- ${item}`).join("\n") : "未收到模型标记的缺失项；仍请以原件和计算盘逐项核验。"}\n\n## 数据来源与置信边界\n\n- **原始资料**：${data.sourcePriority.original}\n- **提取结果**：${data.sourcePriority.extractedFields}\n- **优先级**：${data.sourcePriority.canonicalRule}\n- **当前置信状态**：${data.sourcePriority.confidence}`;
}

function fallbackDocumentExtraction(hasLinkedCalculation: boolean): DocumentExtraction {
  const sourcePriority = {
    original: "原始文件仅在本次临时分析中使用，未被保存。",
    extractedFields: "本次没有可验证的 AI 字段提取。",
    canonicalRule: hasLinkedCalculation ? "已关联完整出生资料的计算盘时，以计算盘为主；原件仅作逐项交叉校对。" : "补齐出生日期、时间、地点和时区后应重算建立计算盘；在此之前原件仅为候选资料。",
    confidence: "待确认" as const,
  };
  const data = { summary: "未能从文件中取得可验证文本。", birthFields: [], chartFields: [], missingFields: ["需要人工核对原始文件或补充完整出生资料"], sourcePriority };
  return { ...data, markdown: renderDocumentExtraction(data) };
}

export async function extractChartDocument(input: { dataUrl: string; mimeType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf"; hasLinkedCalculation: boolean; modelConfig?: TemporaryModelConfig }): Promise<DocumentExtraction> {
  const content = input.mimeType === "application/pdf"
    ? [{ type: "file_url" as const, file_url: { url: input.dataUrl, mime_type: "application/pdf" as const } }]
    : [{ type: "image_url" as const, image_url: { url: input.dataUrl, detail: "high" as const } }];
  try {
    const result = await invokeCompatibleModel({
      selection: input.modelConfig,
      messages: [
        { role: "system", content: `你是吠陀占星资料提取助手。${STACK_BOUNDARIES.document}\n你必须只输出符合 JSON schema 的对象。每个字段都要附 status 和 evidence；看不清的内容必须使用“待人工确认”或“不可读取”，绝不可补写未知数据。` },
        { role: "user", content: [{ type: "text", text: "请从上传的星盘图片或 PDF 中提取可见的结构化数据。" }, ...content] },
      ], responseFormat: { type: "json_schema", json_schema: { name: "vedic_chart_document", strict: true, schema: { type: "object", properties: { summary: { type: "string" }, birthFields: { type: "array", items: { type: "object", properties: { field: { type: "string" }, value: { type: "string" }, status: { type: "string", enum: ["已清晰识别", "待人工确认", "不可读取"] }, evidence: { type: "string" } }, required: ["field", "value", "status", "evidence"], additionalProperties: false } }, chartFields: { type: "array", items: { type: "object", properties: { field: { type: "string" }, value: { type: "string" }, status: { type: "string", enum: ["已清晰识别", "待人工确认", "不可读取"] }, evidence: { type: "string" } }, required: ["field", "value", "status", "evidence"], additionalProperties: false } }, missingFields: { type: "array", items: { type: "string" } } }, required: ["summary", "birthFields", "chartFields", "missingFields"], additionalProperties: false } } },
      });
      const answer = extractCompatibleText(result);
    if (!answer) return fallbackDocumentExtraction(input.hasLinkedCalculation);
    const parsed = JSON.parse(answer) as Pick<DocumentExtraction, "summary" | "birthFields" | "chartFields" | "missingFields">;
    const sourcePriority = {
        original: "原始文件仅在本次临时分析中使用，未被保存。",
      extractedFields: "字段逐项保留识别状态和图像/PDF 文字依据；未确认字段不会转为盘面事实。",
      canonicalRule: input.hasLinkedCalculation ? "已关联完整出生资料的计算盘时，以计算盘为主；PDF/截图仅作逐项交叉校对。" : "未关联计算盘时，提取结果只是候选资料；补齐出生时空后应以重算建立的计算盘为主。",
      confidence: "待确认" as const,
    };
    const data = { ...parsed, sourcePriority };
    return { ...data, markdown: renderDocumentExtraction(data) };
  } catch (error) {
    console.error("[Vedic] document extraction failed", error);
    return fallbackDocumentExtraction(input.hasLinkedCalculation);
  }
}

export function createChartForStack(stack: AnalysisStack, input: BirthInput, options?: { year?: number; prashnaLocation?: Omit<BirthInput, "date" | "time"> }) {
  if (stack === "prashna" && options?.prashnaLocation) return calculatePrashnaChart(options.prashnaLocation);
  if (stack === "tajika") return calculateTajikaChart(input, options?.year || new Date().getFullYear());
  return calculateVedicChart(input, stack === "kp" ? "kp" : "natal");
}
