import VedicChart from "@/components/VedicChart";
import { trpc } from "@/lib/trpc";
import { streamReport } from "@/lib/stream";
import { renderLightMarkdown, splitStableTail } from "@/lib/light-markdown";
import { shouldScheduleLocationSearch } from "@/lib/location-search";
import type { VedicChart as VedicChartData } from "@shared/vedic-engine";
import type { KpSubLordRow } from "@shared/kp";
import type { RectificationCandidate } from "@shared/rectification";
import type { SynastryDrishti, SynastryOverlay } from "@shared/synastry";
import { DEFAULT_MODEL_CONFIG, MODEL_PROVIDERS, type ModelProviderId, type TemporaryModelConfig } from "@shared/model-config";
import { buildPrashnaLocation } from "@shared/prashna-location";
import { validatePrashnaQuestion } from "@shared/prashna-question";
import { ArrowRight, BookOpen, Bot, BriefcaseBusiness, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Compass, FileSearch, Grid2X2, Heart, Landmark, Layers3, Loader2, MapPin, Orbit, RotateCcw, ScrollText, ShieldCheck, Sparkles, Square, SunMedium, Trash2, UploadCloud, UsersRound, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type WheelEvent as ReactWheelEvent } from "react";
import { toast } from "sonner";

type ModuleKey = "natal" | "reader" | "p1p12" | "rectification" | "career" | "love" | "synastry" | "prashna" | "tajika" | "kp";
type BirthDraft = { name: string; date: string; time: string; place: string; latitude: string; longitude: string; timezoneOffset: string; timeAccuracy: string; timeSource: string; timeBasis: "wall_clock" | "standard_time" | "unknown" };
type MemoryReport = { id: number; stack: string; title: string; resultMarkdown: string; createdAt: Date };

const MODULES: Array<{ id: ModuleKey; label: string; code: string; description: string; icon: typeof Orbit }> = [
  { id: "natal", label: "出生信息排盘", code: "P00", description: "以出生时空生成恒星黄道 D1 基础工作盘", icon: Orbit },
  { id: "reader", label: "PDF / 截图读盘", code: "P00-R", description: "临时提取盘面资料并标示置信边界", icon: FileSearch },
  { id: "p1p12", label: "P1–P12 D1 十二宫概览", code: "P01–12", description: "逐宫展开 D1 基础结构；非完整 P1–P12 行星审计", icon: ScrollText },
  { id: "rectification", label: "出生时间候选比较", code: "BTR", description: "用候选与事件建立初步校时路径，不声明分钟级结论", icon: RotateCcw },
  { id: "career", label: "职业专项", code: "H10", description: "第十宫与职业表达的专题解读", icon: BriefcaseBusiness },
  { id: "love", label: "恋爱与伴侣", code: "H07", description: "第七宫、关系节律与伴侣主题", icon: Heart },
  { id: "synastry", label: "双人合盘", code: "SYN", description: "分别阅读二人，再观察交点", icon: UsersRound },
  { id: "prashna", label: "Prashna 卜问", code: "PR", description: "以当下时刻独立起问盘", icon: CircleHelp },
  { id: "tajika", label: "Tajika 年度回归工作点", code: "SR", description: "本命太阳回归时刻与 D1 基础对照；不含十六 Yoga", icon: SunMedium },
  { id: "kp", label: "KP 1–249 资料核对栈", code: "KP 1–249", description: "独立编号资料核对；不含完整 KP cuspal 判读", icon: Layers3 },
];
const NAV_GROUPS: Array<{ label: string; ids: ModuleKey[] }> = [
  { label: "本命工作", ids: ["natal", "reader", "p1p12", "rectification"] },
  { label: "专项观察", ids: ["career", "love", "synastry"] },
  { label: "独立栈", ids: ["prashna", "tajika", "kp"] },
];

const initialBirth: BirthDraft = { name: "", date: "", time: "", place: "", latitude: "", longitude: "", timezoneOffset: "", timeAccuracy: "精确到分钟", timeSource: "出生证明 / 医院记录", timeBasis: "wall_clock" };
const initialPrashnaLocation = { place: "", latitude: "", longitude: "", timezoneOffset: "480" };
const emptyBirthInput = { date: "2000-01-01", time: "12:00", place: "临时地点", latitude: 0, longitude: 0, timezoneOffset: 0, timeAccuracy: "不确定", timeSource: "未提供", timeBasis: "unknown" as const };
const defaultModelDraft = (): Required<TemporaryModelConfig> => ({ ...DEFAULT_MODEL_CONFIG, apiKey: "" });
const Streamdown = lazy(() => import("streamdown").then(module => ({ default: module.Streamdown })));

declare global { interface Window { AMap?: any; _AMapSecurityConfig?: { serviceHost?: string } } }
let amapLoadPromise: Promise<any> | null = null;
function resetAmapLoader() {
  amapLoadPromise = null;
  document.querySelector('script[data-amap-jsapi="true"]')?.remove();
  delete window.AMap;
}
function loadAmapMap(jsApiKey: string) {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (amapLoadPromise) return amapLoadPromise;
  window._AMapSecurityConfig = { serviceHost: `${window.location.origin}/_AMapService` };
  amapLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.amapJsapi = "true";
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsApiKey)}`;
    script.async = true;
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error("高德地图加载失败"));
    script.onerror = () => reject(new Error("高德地图脚本无法加载"));
    document.head.appendChild(script);
  });
  return amapLoadPromise;
}

function formatDate(value: Date | string) { return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }
function formatUtcOffset(value: number | string) { const offset = Number(value); if (!Number.isFinite(offset)) return "UTC—"; const sign = offset >= 0 ? "+" : "-"; const totalMinutes = Math.abs(Math.round(offset)); return `UTC${sign}${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`; }
const KP_SIGNS_ZH = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"];
const KP_NAKSHATRAS_ZH: Record<string, string> = { Ashwini: "阿什维尼", Bharani: "婆罗尼", Krittika: "昴宿", Rohini: "毕宿", Mrigashira: "觜宿", Ardra: "参宿", Punarvasu: "井宿", Pushya: "鬼宿", Ashlesha: "柳宿", Magha: "星宿", "Purva Phalguni": "张宿", "Uttara Phalguni": "翼宿", Hasta: "轸宿", Chitra: "角宿", Swati: "亢宿", Vishakha: "氐宿", Anuradha: "房宿", Jyeshtha: "心宿", Mula: "尾宿", "Purva Ashadha": "箕宿", "Uttara Ashadha": "斗宿", Shravana: "女宿", Dhanishta: "虚宿", Shatabhisha: "危宿", "Purva Bhadrapada": "室宿", "Uttara Bhadrapada": "壁宿", Revati: "奎宿" };
const KP_GRAHAS_ZH: Record<string, string> = { Ketu: "计都", Venus: "金星", Sun: "太阳", Moon: "月亮", Mars: "火星", Rahu: "罗睺", Jupiter: "木星", Saturn: "土星", Mercury: "水星" };
function kpDegreeLabel(value: number) { const normalized = Math.min(Math.max(value, 0), 360); const signIndex = Math.min(Math.floor(normalized / 30), 11); let totalSeconds = Math.round((normalized - signIndex * 30) * 3600); let degree = Math.floor(totalSeconds / 3600); totalSeconds %= 3600; const minute = Math.floor(totalSeconds / 60); const second = totalSeconds % 60; if (degree === 30 && normalized < 360) degree = 29; return `${KP_SIGNS_ZH[signIndex]} ${String(degree).padStart(2, "0")}°${String(minute).padStart(2, "0")}′${String(second).padStart(2, "0")}″`; }
function scrollWithKeyboard(event: KeyboardEvent<HTMLElement>) { const target = event.currentTarget; const page = Math.max(96, Math.floor(target.clientHeight * .82)); const offsets: Record<string, number> = { ArrowDown: 40, ArrowUp: -40, PageDown: page, PageUp: -page, Home: -target.scrollTop, End: target.scrollHeight }; const offset = offsets[event.key]; if (offset === undefined) return; event.preventDefault(); target.scrollBy({ top: offset, behavior: "smooth" }); }
function scrollPageWithKeyboard(event: KeyboardEvent<HTMLElement>) { const page = Math.max(160, Math.floor(window.innerHeight * .82)); const offsets: Record<string, number> = { ArrowDown: 48, ArrowUp: -48, PageDown: page, PageUp: -page, Home: -window.scrollY, End: document.documentElement.scrollHeight }; const offset = offsets[event.key]; if (offset === undefined) return; event.preventDefault(); window.scrollBy({ top: offset, behavior: "smooth" }); }
function scrollNavigationWithKeyboard(event: KeyboardEvent<HTMLElement>) { const target = event.currentTarget; const page = Math.max(96, Math.floor(target.clientWidth * .7)); const offsets: Record<string, number> = { ArrowRight: 56, ArrowLeft: -56, PageDown: page, PageUp: -page, Home: -target.scrollLeft, End: target.scrollWidth }; const offset = offsets[event.key]; if (offset === undefined) return; event.preventDefault(); target.scrollBy({ left: offset, behavior: "smooth" }); }
function scrollNavigationWithWheel(event: ReactWheelEvent<HTMLElement>) { const target = event.currentTarget; if (target.scrollWidth <= target.clientWidth || (!event.shiftKey && Math.abs(event.deltaY) < Math.abs(event.deltaX))) return; event.preventDefault(); target.scrollBy({ left: event.deltaY, behavior: "auto" }); }
function blurNumberInputOnWheel(event: ReactWheelEvent<HTMLInputElement>) { event.currentTarget.blur(); }

export default function Home() {
  const requestedModule = new URLSearchParams(window.location.search).get("module") as ModuleKey | null;
  const compactPreview = new URLSearchParams(window.location.search).get("compact") === "1";
  const [started, setStarted] = useState(Boolean(requestedModule));
  const [active, setActive] = useState<ModuleKey>(() => requestedModule && MODULES.some(item => item.id === requestedModule) ? requestedModule : "natal");
  const [birth, setBirth] = useState<BirthDraft>({ ...initialBirth });
  const [selectedChart, setSelectedChart] = useState<{ label: string; chart: VedicChartData } | null>(null);
  const [reports, setReports] = useState<MemoryReport[]>([]);
  const [reportText, setReportText] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [events, setEvents] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [partner, setPartner] = useState<BirthDraft>({ ...initialBirth });
  const [prashnaLocation, setPrashnaLocation] = useState({ ...initialPrashnaLocation });
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [kpNumber, setKpNumber] = useState("1");
  const [fileName, setFileName] = useState("");
  const [modelConfig, setModelConfig] = useState<Required<TemporaryModelConfig>>(defaultModelDraft);
  const [modelConfigOpen, setModelConfigOpen] = useState(false);
  const [showAllReports, setShowAllReports] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"birth" | "partner" | "prashna" | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const kpTableQuery = trpc.kp.table.useQuery();
  const modelStatusQuery = trpc.model.status.useQuery();
  const [synastryPreview, setSynastryPreview] = useState<{ overlays: SynastryOverlay[]; drishti: SynastryDrishti[]; moonScreening: { aNakshatra: string; bNakshatra: string; taraDistance: number; note: string }; methodology: string } | null>(null);
  const birthPayload = (value: BirthDraft = birth) => ({ ...value, latitude: Number(value.latitude), longitude: Number(value.longitude), timezoneOffset: Number(value.timezoneOffset) });
  const validBirth = (value: BirthDraft = birth) => Boolean(value.date && value.time && value.place && value.latitude !== "" && value.longitude !== "" && value.timezoneOffset !== "");
  const prashnaPayload = () => {
    const result = buildPrashnaLocation(prashnaLocation);
    if (!result.payload) { toast.error(result.error || "请检查本次起盘地点资料"); return null; }
    return result.payload;
  };
  const requestModelConfig = (): TemporaryModelConfig | null => {
    const candidate: TemporaryModelConfig = { provider: modelConfig.provider, model: modelConfig.model.trim() || undefined, apiKey: modelConfig.apiKey.trim() || undefined };
    if (candidate.provider !== "agnes" && !candidate.apiKey) { toast.error("请在模型配置中填写当前会话使用的 API Key"); return null; }
    if (candidate.provider === "agnes" && modelStatusQuery.data?.configured === false) { toast.error("默认 Agnes 模型尚未部署；请在模型配置中改用本次会话 API Key"); setModelConfigOpen(true); return null; }
    return candidate;
  };
  const rectificationInput = useMemo(() => ({ birthInput: selectedChart?.chart.birth || emptyBirthInput }), [selectedChart]);
  const rectificationPreview = trpc.rectification.preview.useQuery(rectificationInput, { enabled: active === "rectification" && Boolean(selectedChart) });
  const calculateChart = trpc.chart.calculate.useMutation({
    onSuccess: chart => { setSelectedChart({ label: birth.name.trim() || `${birth.place} · 本次工作盘`, chart: chart as VedicChartData }); setReportText(null); toast.success("已建立本次临时工作盘；刷新页面后将自动清除"); },
    onError: error => toast.error(error.message),
  });
  // ---- AI 报告流式输出（SSE /api/stream/report） ----
  const [streaming, setStreaming] = useState(false);
  const streamAbortRef = useRef<(() => void) | null>(null);
  const pendingReportRef = useRef("");
  const reportFlushRef = useRef<number | null>(null);
  const reportScrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  /** 流式期间直接写纯文本 DOM，绕过 React 重渲染与 markdown 解析，保证最流畅。 */
  const rawReportRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  /** 已稳定块的上次渲染指纹（避免长文本每次 flush 全量重建）。 */
  const lastStableHtmlRef = useRef("");
  /** 最近一次收到模型增量的时间（用于等待呼吸提示）。 */
  const lastChunkAtRef = useRef(Date.now());
  /** 滚动跟随节流（减少强制布局频率）。 */
  const lastScrollCheckRef = useRef(0);
  /** 流式渲染节流：约 100ms 一次批量把累积文本写入 DOM。 */
  const FLUSH_INTERVAL_MS = 100;
  const flushPendingReport = () => {
    reportFlushRef.current = null;
    if (streamingRef.current && rawReportRef.current) {
      // 流式：行级增量渲染 —— 稳定块只在变化时重建；尾部活动块按形态选择最快写入
      const { stable, tail } = splitStableTail(pendingReportRef.current);
      if (stable !== lastStableHtmlRef.current) {
        const stableEl = rawReportRef.current.querySelector<HTMLDivElement>(".rm-stable");
        if (stableEl) stableEl.innerHTML = renderLightMarkdown(stable);
        lastStableHtmlRef.current = stable;
      }
      const tailEl = rawReportRef.current.querySelector<HTMLDivElement>(".rm-tail");
      if (tailEl) {
        const tailTrim = tail.trim();
        const isPlainParagraph = tailTrim.length > 0 && !/^[-#>]/.test(tailTrim) && !tail.includes("\n") && !tail.includes("**") && !tail.includes("`");
        if (isPlainParagraph) {
          // 增长中的纯段落：textContent 直写，零解析零标签，长文本也不卡
          tailEl.textContent = tailTrim;
        } else {
          tailEl.innerHTML = renderLightMarkdown(tail);
        }
      }
      lastChunkAtRef.current = Date.now();
      // 滚动跟随节流：约 300ms 才做一次强制布局检查
      const now = performance.now();
      if (now - lastScrollCheckRef.current > 300) {
        lastScrollCheckRef.current = now;
        if (!userScrolledUpRef.current) {
          const rect = rawReportRef.current.getBoundingClientRect();
          if (rect.bottom > window.innerHeight + 8) rawReportRef.current.scrollIntoView({ block: "end", behavior: "auto" });
        }
      }
    } else {
      setReportText(pendingReportRef.current);
    }
  };
  const appendReportDelta = (text: string) => {
    pendingReportRef.current += text;
    if (reportFlushRef.current === null) {
      reportFlushRef.current = window.setTimeout(flushPendingReport, FLUSH_INTERVAL_MS) as unknown as number;
    }
  };
  const startReportStream = (payload: Record<string, unknown>) => {
    streamAbortRef.current?.();
    pendingReportRef.current = "";
    if (reportFlushRef.current !== null) { window.clearTimeout(reportFlushRef.current); reportFlushRef.current = null; }
    if (rawReportRef.current) {
      rawReportRef.current.querySelector<HTMLDivElement>(".rm-stable")?.replaceChildren();
      rawReportRef.current.querySelector<HTMLDivElement>(".rm-tail")?.replaceChildren();
    }
    lastStableHtmlRef.current = "";
    // 预热 markdown 渲染器，避免完成后出现“正在展开卷轴”的加载态
    void import("streamdown");
    streamingRef.current = true;
    setReportText(null);
    setReportTitle(module.label);
    setStreaming(true);
    streamAbortRef.current = streamReport(payload, {
      onDelta: appendReportDelta,
      onRestart: () => {
        pendingReportRef.current = "";
        if (reportFlushRef.current !== null) { window.clearTimeout(reportFlushRef.current); reportFlushRef.current = null; }
        if (rawReportRef.current) {
          rawReportRef.current.querySelector<HTMLDivElement>(".rm-stable")?.replaceChildren();
          rawReportRef.current.querySelector<HTMLDivElement>(".rm-tail")?.replaceChildren();
        }
        lastStableHtmlRef.current = "";
      },
      onDone: data => {
        streamingRef.current = false;
        const report: MemoryReport = { ...data.report, createdAt: new Date(data.report.createdAt) };
        setReports(current => [report, ...current].slice(0, 12));
        setReportText(report.resultMarkdown);
        setReportTitle(report.title);
        if (data.previewChart && !selectedChart && active !== "prashna" && active !== "kp") setSelectedChart({ label: "本次工作盘", chart: data.previewChart as VedicChartData });
        if (active === "synastry" && data.synastry) setSynastryPreview(data.synastry as typeof synastryPreview);
        setStreaming(false);
        streamAbortRef.current = null;
        window.setTimeout(() => { if (!userScrolledUpRef.current && reportScrollRef.current) reportScrollRef.current.scrollIntoView({ block: "end", behavior: "auto" }); }, 0);
        toast.success("AI 解读仅保留在当前页面会话中");
      },
      onError: message => {
        streamingRef.current = false;
        setStreaming(false);
        streamAbortRef.current = null;
        toast.error(message);
      },
    });
  };
  const stopGeneration = () => {
    streamAbortRef.current?.();
    streamAbortRef.current = null;
    streamingRef.current = false;
    if (reportFlushRef.current !== null) { window.clearTimeout(reportFlushRef.current); reportFlushRef.current = null; }
    setReportText(pendingReportRef.current);
    setStreaming(false);
  };
  const openStoredReport = (report: MemoryReport) => {
    streamAbortRef.current?.();
    streamAbortRef.current = null;
    streamingRef.current = false;
    if (reportFlushRef.current !== null) { window.clearTimeout(reportFlushRef.current); reportFlushRef.current = null; }
    pendingReportRef.current = "";
    setStreaming(false);
    setReportTitle(report.title);
    setReportText(report.resultMarkdown);
  };
  // 用户上滚查看已生成内容时暂停自动跟随；回到报告底部附近后恢复
  useEffect(() => {
    const onWindowScroll = () => {
      const el = reportScrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      userScrolledUpRef.current = rect.bottom - window.innerHeight > 240;
    };
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", onWindowScroll);
  }, []);
  // 流式等待呼吸：约 500ms 无新增量时，尾部光标切换为慢速呼吸，缓解“停顿感”
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!streamingRef.current || !rawReportRef.current) return;
      const waiting = Date.now() - lastChunkAtRef.current > 500;
      rawReportRef.current.classList.toggle("is-waiting", waiting);
    }, 300);
    return () => window.clearInterval(timer);
  }, []);
  // 完成定型后：把 Streamdown 渲染的列表项内 ✓/✗ emoji 前缀替换为 CSS 几何标记
  useEffect(() => {
    if (streaming || !reportText) return;
    const root = reportScrollRef.current;
    if (!root) return;
    const enhance = (li: HTMLElement) => {
      if (li.dataset.lmEnhanced === "1") return;
      const firstText = Array.from(li.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined;
      if (!firstText) return;
      const match = firstText.textContent?.match(/^([✅✓✔])(\s+)(.*)$/) || firstText.textContent?.match(/^([❌✗✘])(\s+)(.*)$/);
      if (!match) return;
      const [, sym, , rest] = match;
      const cls = /[✅✓✔]/.test(sym) ? "lm-mark--yes" : "lm-mark--no";
      const wrapper = document.createElement("span");
      const textNode = document.createTextNode(rest);
      const mark = document.createElement("span");
      mark.className = `lm-mark ${cls}`;
      mark.setAttribute("aria-hidden", "true");
      wrapper.appendChild(mark);
      wrapper.appendChild(textNode);
      li.insertBefore(wrapper, firstText);
      li.removeChild(firstText);
      li.dataset.lmEnhanced = "1";
    };
    const tick = () => {
      root.querySelectorAll<HTMLElement>("ul li").forEach(enhance);
    };
    let tries = 0;
    const handle = window.setInterval(() => {
      tries++;
      tick();
      if (tries > 30) window.clearInterval(handle);
    }, 120);
    tick();
    return () => window.clearInterval(handle);
  }, [reportText, streaming]);
  const ingest = trpc.document.ingest.useMutation({
    onSuccess: data => { const report = data.report as MemoryReport; setReports(current => [report, ...current].slice(0, 12)); setReportText(report.resultMarkdown); setReportTitle(report.title); toast.success("资料已完成临时识读；未保存原始文件或结果"); },
    onError: error => toast.error(error.message),
  });
  const mapConfigQuery = trpc.location.mapConfig.useQuery(undefined, { enabled: locationPickerOpen });
  const timezoneLookup = trpc.location.timezone.useMutation();
  const currentTimezoneLookup = trpc.location.currentTimezone.useMutation();
  const module = useMemo(() => MODULES.find(item => item.id === active)!, [active]);
  useEffect(() => {
    const activeButton = document.querySelector<HTMLButtonElement>(`[data-module-id="${active}"]`);
    activeButton?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [active]);
  useEffect(() => {
    if (!birth.date || !birth.time || birth.latitude === "" || birth.longitude === "") return;
    const latitude = Number(birth.latitude);
    const longitude = Number(birth.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    timezoneLookup.mutate({ latitude, longitude, date: birth.date, time: birth.time }, {
      onSuccess: result => setBirth(current => current.timezoneOffset === String(result.timezoneOffset) ? current : { ...current, timezoneOffset: String(result.timezoneOffset) }),
    });
  }, [birth.date, birth.time, birth.latitude, birth.longitude]);
  const busy = calculateChart.isPending || streaming || ingest.isPending;
  const isolatedStack = active === "prashna" || active === "kp";
  const visibleReports = isolatedStack ? reports.filter(report => report.stack === active) : reports.filter(report => report.stack !== "prashna" && report.stack !== "kp");
  const selectModule = (id: ModuleKey) => { setActive(id); setReportText(null); setQuestion(""); setExtraContext(""); };
  const clearSession = () => { streamAbortRef.current?.(); streamAbortRef.current = null; pendingReportRef.current = ""; if (reportFlushRef.current !== null) { window.clearTimeout(reportFlushRef.current); reportFlushRef.current = null; } setStreaming(false); setBirth({ ...initialBirth }); setPartner({ ...initialBirth }); setPrashnaLocation({ ...initialPrashnaLocation }); setSelectedChart(null); setReports([]); setReportText(null); setReportTitle(""); setQuestion(""); setEvents(""); setExtraContext(""); setFileName(""); setSynastryPreview(null); setModelConfig(defaultModelDraft()); setModelConfigOpen(false); setActive("natal"); toast.success("当前临时会话已清除"); };
  const run = (stack: "natal" | "prashna" | "tajika" | "kp" | "synastry" | "rectification", moduleId: string, additions: Record<string, unknown> = {}) => {
    const needsChart = ["p1p12", "career", "love", "tajika", "synastry", "rectification"].includes(active);
    if (needsChart && !selectedChart && active !== "synastry") { toast.error("请先在本次会话中完成出生信息排盘"); return; }
    const requestedModel = requestModelConfig(); if (!requestedModel) return;
    startReportStream({ stack, module: moduleId, chartInput: stack !== "prashna" && stack !== "kp" ? selectedChart?.chart.birth : undefined, question: question || undefined, events: events || undefined, extraContext: extraContext || undefined, modelConfig: requestedModel, ...additions });
  };
  const calculateCurrentBirth = () => { if (!validBirth()) return toast.error("请填写日期、时间、地点、经纬度与时区"); calculateChart.mutate(birthPayload()); };
  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
  const uploadFile = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) return toast.error("请选择 PNG、JPG、WEBP 或 PDF 文件");
    if (file.size > 7 * 1024 * 1024) return toast.error("文件需小于 7MB");
    setFileName(file.name);
    const requestedModel = requestModelConfig(); if (!requestedModel) return;
    try { ingest.mutate({ fileName: file.name, mimeType: file.type as "image/png" | "image/jpeg" | "image/webp" | "application/pdf", dataUrl: await fileToDataUrl(file), hasLinkedCalculation: Boolean(selectedChart), modelConfig: requestedModel }); } catch { toast.error("读取文件失败，请重试"); }
  };
  const resolveBirthPlace = () => { setPickerTarget("birth"); setLocationPickerOpen(true); };
  const resolvePartnerPlace = () => { setPickerTarget("partner"); setLocationPickerOpen(true); };
  const resolvePrashnaMapPlace = () => { setPickerTarget("prashna"); setLocationPickerOpen(true); };
  const closeLocationPicker = () => { setLocationPickerOpen(false); setPickerTarget(null); };
  const applyMapLocation = (target: "birth" | "partner" | "prashna", location: { formatted: string; latitude: number; longitude: number }) => {
    const latitude = String(location.latitude.toFixed(4));
    const longitude = String(location.longitude.toFixed(4));
    if (target === "prashna") {
      // Prashna 起盘时刻由系统决定，不存在 date+time 分支，始终走当前时刻查时区
      currentTimezoneLookup.mutate({ latitude: location.latitude, longitude: location.longitude }, {
        onSuccess: result => setPrashnaLocation(current => {
          if (current.latitude !== latitude || current.longitude !== longitude) return current;
          return current.timezoneOffset === String(result.timezoneOffset) ? current : { ...current, timezoneOffset: String(result.timezoneOffset) };
        }),
        onError: error => toast.error(error.message),
      });
      setPrashnaLocation(current => ({ ...current, place: location.formatted, latitude, longitude, timezoneOffset: "" }));
      closeLocationPicker();
      toast.success("已从地图选点回填地址、经纬度与时区");
      return;
    }
    const source = target === "birth" ? birth : partner;
    const setter = target === "birth" ? setBirth : setPartner;
    const applyTimezone = (timezoneOffset: number) => setter(current => {
      if (current.latitude !== latitude || current.longitude !== longitude) return current;
      return current.timezoneOffset === String(timezoneOffset) ? current : { ...current, timezoneOffset: String(timezoneOffset) };
    });
    setter(current => ({ ...current, place: location.formatted, latitude, longitude, timezoneOffset: "" }));
    if (source.date && source.time) {
      timezoneLookup.mutate({ latitude: location.latitude, longitude: location.longitude, date: source.date, time: source.time }, {
        onSuccess: result => applyTimezone(result.timezoneOffset),
        onError: error => toast.error(error.message),
      });
    } else {
      currentTimezoneLookup.mutate({ latitude: location.latitude, longitude: location.longitude }, {
        onSuccess: result => applyTimezone(result.timezoneOffset),
        onError: error => toast.error(error.message),
      });
    }
    closeLocationPicker();
    toast.success("已从地图选点回填地址、经纬度与时区");
  };
  const resolvePrashnaPlace = resolvePrashnaMapPlace;

  if (!started) return <Landing onStart={() => setStarted(true)} onModule={() => { setStarted(true); setActive("p1p12"); }} />;
  return <div className={`paper-bg app-shell app-shell--top module-${active}${compactPreview ? " compact-preview" : ""}`}>
    <header className="app-topbar">
      <div className="topbar-ident">
        <button className="brand" onClick={() => { window.history.replaceState({}, "", "/"); setStarted(false); }} aria-label="返回观星录官网首页"><span className="brand-seal">观</span><span className="brand-copy"><strong>观星录</strong><small>VEDIC · JYOTISH</small></span></button>
      </div>
      <nav className="top-nav" aria-label="功能导航；可用方向键、Page Up、Page Down、Home 和 End 横向滚动" tabIndex={0} onKeyDown={scrollNavigationWithKeyboard} onWheel={scrollNavigationWithWheel}>{NAV_GROUPS.map(group => <div className="top-nav-group" key={group.label}><span className="top-nav-group__label">{group.label}</span>{group.ids.map(id => { const item = MODULES.find(candidate => candidate.id === id)!; return <button data-module-id={item.id} key={item.id} className={active === item.id ? "active" : ""} onClick={() => selectModule(item.id)}><span className="top-nav__code">{item.code}</span><item.icon /><span>{item.label}</span></button>; })}</div>)}</nav>
      <div className="topbar-actions"><div className="model-config-anchor"><button type="button" className={`model-config-trigger${modelConfigOpen ? " is-open" : ""}`} aria-label="配置本次会话的 AI 模型" aria-expanded={modelConfigOpen} onClick={() => setModelConfigOpen(current => !current)}><Bot size={16} /></button>{modelConfigOpen && <ModelConfigCard value={modelConfig} onChange={setModelConfig} onClose={() => setModelConfigOpen(false)} />}</div><button onClick={clearSession} className="topbar-clear" aria-label="清除本次会话"><Trash2 size={14} /><span>清除</span></button></div>
    </header>
    <main className="app-main">
      <header className="workspace-top"><div><div className="eyebrow">{module.code} · {isolatedStack ? "ISOLATED STACK" : "TEMPORARY WORKFLOW"}</div><h1>{module.label}</h1><p>{module.description}</p></div><div className="status"><ShieldCheck /> 无账号 · 不存储 · 刷新即清除</div></header>
      <div className="workspace-grid"><section className="panel workspace-card">
        <div className="module-intro"><div className="glyph"><module.icon size={19} /></div><div><h2>{module.label}</h2><p>{introFor(active)}</p></div></div>
        {selectedChart && !isolatedStack && <div className="selected-chart"><div><span>当前临时工作盘</span><strong>{selectedChart.label} · 上升 {selectedChart.chart.lagna.signZh}座</strong></div><button className="line-button text-xs" onClick={() => setActive("natal")}>更换</button></div>}
        {active === "natal" && <NatalPanel birth={birth} setBirth={setBirth} calculate={calculateCurrentBirth} resolvePlace={resolveBirthPlace} resolvingPlace={mapConfigQuery.isLoading} busy={busy} />}
        {active === "reader" && <ReaderPanel busy={busy} fileName={fileName} uploadRef={uploadRef} onUpload={uploadFile} />}
        {active === "p1p12" && <CorePanel busy={busy} question={question} setQuestion={setQuestion} run={() => run("natal", "p1p12")} />}
        {active === "career" && <SpecialPanel type="career" busy={busy} question={question} setQuestion={setQuestion} run={() => run("natal", "career")} />}
        {active === "love" && <SpecialPanel type="love" busy={busy} question={question} setQuestion={setQuestion} run={() => run("natal", "love")} />}
        {active === "rectification" && <RectificationPanel busy={busy} preview={rectificationPreview.data} events={events} setEvents={setEvents} run={() => run("rectification", "rectification")} />}
        {active === "synastry" && <SynastryPanel busy={busy} preview={synastryPreview} partner={partner} setPartner={setPartner} question={question} setQuestion={setQuestion} hasChart={Boolean(selectedChart)} resolvePartnerPlace={resolvePartnerPlace} resolvingPartnerPlace={mapConfigQuery.isLoading} run={() => { const requestedModel = requestModelConfig(); if (!requestedModel || !selectedChart || !validBirth(partner)) return toast.error("请在本次会话中完成你的排盘，并完整填写对方出生资料"); startReportStream({ stack: "synastry", module: "synastry", chartInput: selectedChart.chart.birth, partnerInput: birthPayload(partner), question: question || undefined, modelConfig: requestedModel }); }} />}
        {active === "prashna" && <PrashnaPanel busy={busy} location={prashnaLocation} setLocation={setPrashnaLocation} resolvePlace={resolvePrashnaPlace} question={question} setQuestion={setQuestion} run={() => { const questionCheck = validatePrashnaQuestion(question); if (!questionCheck.valid) return toast.error(questionCheck.error); const locationPayload = prashnaPayload(); if (!locationPayload) return; const requestedModel = requestModelConfig(); if (!requestedModel) return; startReportStream({ stack: "prashna", module: "prashna", question: questionCheck.question, modelConfig: requestedModel, prashnaLocation: locationPayload }); }} />}
        {active === "tajika" && <TajikaPanel busy={busy} year={year} setYear={setYear} run={() => run("tajika", "tajika", { year: Number(year) })} />}
        {active === "kp" && <KpPanel busy={busy} question={question} setQuestion={setQuestion} extraContext={extraContext} setExtraContext={setExtraContext} table={kpTableQuery.data || []} kpNumber={kpNumber} setKpNumber={setKpNumber} run={() => run("kp", "kp", { kpNumber: Number(kpNumber) })} />}
        {(reportText || streaming) && <article className="report-drawer"><div className="report-drawer__head"><div><div className="eyebrow">REPORT · THIS SESSION ONLY</div><h3>{reportTitle}</h3></div>{streaming && <button type="button" className="report-stop" onClick={stopGeneration} aria-label="停止生成当前报告"><Square size={11} /> 停止生成</button>}</div><div className="report-meta">{streaming ? <span>正在书写…</span> : <><span className="report-seal" aria-hidden="true" /><span>已生成 · {reportText ? reportText.length : 0} 字 · 仅保留在本次会话</span></>}</div>{streaming && <><div className="report-inkwell"><Loader2 className="animate-spin" size={15} /> 模型正在生成首段内容…</div><div className="report-content report-content--raw" ref={reportScrollRef} role="region" aria-label="本次报告内容实时生成中"><div className="report-raw" ref={rawReportRef}><div className="rm-stable" /><div className="rm-tail" /></div></div></>}{!streaming && reportText && <p className="report-reading-note">完整报告已在当前页面连续展开；可继续向下滚动页面，或使用 Page Down / End 键阅读至末尾。</p>}{!streaming && reportText && <div className="report-content" ref={reportScrollRef} tabIndex={0} role="region" aria-label="本次完整报告内容；报告已随页面连续展开，可使用 Page Down 或 End 键继续阅读" onKeyDown={scrollPageWithKeyboard}><Suspense fallback={<div className="report-loading"><Loader2 className="animate-spin" size={16} /> 正在展开卷轴…</div>}><Streamdown isAnimating={false} controls={false}>{reportText}</Streamdown></Suspense></div>}</article>}
      </section><aside className="panel chart-side">{isolatedStack ? <IsolatedStackRail stack={active} reports={visibleReports} showAll={showAllReports} onToggle={() => setShowAllReports(current => !current)} onOpen={openStoredReport} /> : <><>{selectedChart ? <ChartRail chart={selectedChart.chart} /> : <div className="no-chart"><div><div className="empty-chart-sigil" aria-hidden="true"><span>观</span></div><strong className="serif text-[#292b2a] block mb-1">尚未建立本次工作盘</strong>填写出生信息即可临时排盘；页面刷新后不会保留。</div></div>}</><hr className="soft-rule" /><MemoryRail reports={visibleReports} showAll={showAllReports} onToggle={() => setShowAllReports(current => !current)} onOpen={openStoredReport} /></>}</aside>      </div>
    </main>
    {locationPickerOpen && pickerTarget && <AmapLocationPickerDialog jsApiKey={mapConfigQuery.data?.jsApiKey || null} initialAddress={pickerTarget === "prashna" ? prashnaLocation.place : pickerTarget === "partner" ? partner.place : birth.place} initialLatitude={pickerTarget === "prashna" ? prashnaLocation.latitude : pickerTarget === "partner" ? partner.latitude : birth.latitude} initialLongitude={pickerTarget === "prashna" ? prashnaLocation.longitude : pickerTarget === "partner" ? partner.longitude : birth.longitude} onClose={closeLocationPicker} onConfirm={location => applyMapLocation(pickerTarget, location)} />}
  </div>;
}

function AmapLocationPickerDialog({ jsApiKey, initialAddress, initialLatitude, initialLongitude, onClose, onConfirm }: { jsApiKey: string | null; initialAddress: string; initialLatitude: string; initialLongitude: string; onClose: () => void; onConfirm: (location: { formatted: string; latitude: number; longitude: number }) => void }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [search, setSearch] = useState(initialAddress);
  const [selection, setSelection] = useState<{ formatted: string; latitude: number; longitude: number } | null>(() => {
    const hasInitialCoordinates = initialLatitude.trim() !== "" && initialLongitude.trim() !== "";
    const latitude = Number(initialLatitude); const longitude = Number(initialLongitude);
    return hasInitialCoordinates && Number.isFinite(latitude) && Number.isFinite(longitude) ? { formatted: initialAddress || "已选坐标", latitude, longitude } : null;
  });
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);
  const lastAutoSearchRef = useRef<string | null>(null);
  const searchRequestRef = useRef(0);
  const geocode = trpc.location.geocode.useMutation();
  const reverseGeocode = trpc.location.reverseGeocode.useMutation();
  const geocodeMutate = geocode.mutate;
  const reverseGeocodeMutate = reverseGeocode.mutate;
  const pickPoint = useCallback((latitude: number, longitude: number, formatted?: string) => {
    setSelection({ formatted: formatted || "正在读取地址…", latitude, longitude });
    const map = mapRef.current; const AMap = window.AMap;
    if (map && AMap) {
      map.setZoomAndCenter(16, [longitude, latitude]);
      if (markerRef.current) markerRef.current.setPosition([longitude, latitude]);
      else markerRef.current = new AMap.Marker({ position: [longitude, latitude] });
      markerRef.current.setMap(map);
    }
    reverseGeocodeMutate({ latitude, longitude }, {
      onSuccess: result => setSelection(current => current && current.latitude === latitude && current.longitude === longitude ? { ...current, formatted: result.formatted } : current),
      onError: () => setSelection(current => current && current.latitude === latitude && current.longitude === longitude ? { ...current, formatted: formatted || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` } : current),
    });
  }, [reverseGeocodeMutate]);
  const pickPointRef = useRef(pickPoint);
  useEffect(() => { pickPointRef.current = pickPoint; }, [pickPoint]);
  useEffect(() => {
    if (!jsApiKey || !mapElement.current || mapRef.current) return;
    setMapError(null);
    let disposed = false;
    const latitude = Number(initialLatitude); const longitude = Number(initialLongitude);
    const hasInitialPoint = initialLatitude.trim() !== "" && initialLongitude.trim() !== "" && Number.isFinite(latitude) && Number.isFinite(longitude);
    loadAmapMap(jsApiKey).then(AMap => {
      if (disposed || !mapElement.current || mapRef.current) return;
      const map = new AMap.Map(mapElement.current, { zoom: hasInitialPoint ? 15 : 5, center: hasInitialPoint ? [longitude, latitude] : [104.1954, 35.8617] });
      mapRef.current = map;
      map.on("click", (event: any) => pickPointRef.current(event.lnglat.getLat(), event.lnglat.getLng()));
      if (hasInitialPoint) pickPointRef.current(latitude, longitude, initialAddress || undefined);
    }).catch(error => setMapError(error instanceof Error ? error.message : "高德地图加载失败"));
    return () => { disposed = true; mapRef.current?.destroy?.(); mapRef.current = null; markerRef.current = null; };
  }, [jsApiKey, mapAttempt]);
  const retryMap = () => { resetAmapLoader(); setMapError(null); setMapAttempt(current => current + 1); };
  const searchAddress = useCallback((value: string, silent = false) => {
    const address = value.trim();
    if (!address) { if (!silent) toast.error("请输入要搜索的地点"); return; }
    const requestId = ++searchRequestRef.current;
    geocodeMutate({ address }, {
      onSuccess: result => {
        if (requestId !== searchRequestRef.current) return;
        lastAutoSearchRef.current = address;
        pickPoint(result.latitude, result.longitude, result.formatted);
      },
      onError: error => { if (!silent && requestId === searchRequestRef.current) toast.error(error.message); },
    });
  }, [geocodeMutate, pickPoint]);
  useEffect(() => {
    const address = search.trim();
    if (!shouldScheduleLocationSearch(address, lastAutoSearchRef.current)) return;
    const timer = window.setTimeout(() => { if (lastAutoSearchRef.current !== address) searchAddress(address, true); }, 550);
    return () => window.clearTimeout(timer);
  }, [search, searchAddress]);
  return <div className="location-picker-overlay fixed inset-0 z-[100] bg-[#252724]/55 p-0 sm:flex sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="地图选点"><section className="location-picker-dialog flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f8f5ec] shadow-2xl sm:h-[min(42rem,calc(100dvh-2rem))] sm:max-w-6xl sm:border sm:border-[#7d8777]"><header className="location-picker-dialog__header grid shrink-0 grid-cols-[minmax(0,1fr)_2.5rem_2.5rem] items-center gap-2 border-b border-[#d3cfc4] bg-[#f8f5ec] px-3 py-2 sm:flex sm:flex-nowrap sm:px-5 sm:py-3"><div className="col-span-3 min-w-0 sm:col-auto sm:min-w-[9rem] sm:shrink-0"><div className="eyebrow">LOCATION PICKER</div><h3 className="serif text-base text-[#292b2a] sm:text-lg">选择出生地点</h3></div><input className="location-picker-search field h-10 min-w-0 bg-transparent sm:flex-1" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); searchAddress(search); } }} placeholder="搜索地点" /><button type="button" className="location-picker-action location-picker-action--confirm ink-button h-10 w-10 shrink-0 justify-center p-0 text-xs sm:w-auto sm:px-3" onClick={() => selection && onConfirm(selection)} disabled={!selection || reverseGeocode.isPending} aria-label="确认选点">{reverseGeocode.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} <span>确认</span></button><button type="button" className="location-picker-action location-picker-action--close line-button h-10 w-10 shrink-0 justify-center p-0 sm:w-auto sm:px-3" onClick={onClose} aria-label="关闭地图选点"><X size={16} /> <span>关闭</span></button></header><div className="location-picker-map-region relative min-h-0 flex-1 bg-[#f8f5ec] p-2 sm:p-4"><div className="h-full min-h-[18rem]">{jsApiKey && !mapError ? <div ref={mapElement} className="h-full min-h-[18rem] w-full border border-[#b8b5ac] bg-[#f8f5ec]" /> : <div className="flex h-full min-h-[18rem] items-center justify-center border border-dashed border-[#b8b5ac] bg-[#f8f5ec] p-6 text-center"><div className="max-w-sm space-y-3"><strong className="serif block text-base text-[#292b2a]">{mapError ? "地图暂时无法加载" : "地图服务尚未配置"}</strong><p className="text-sm leading-6 text-[#77746d]">{mapError ? "可先使用顶栏地址搜索确定位置，或在网络恢复后重新加载地图。" : "地址搜索仍可返回候选坐标；配置 JS API Key 与安全密钥后，可在这里直接点击地图精确选点。"}</p>{mapError && <button type="button" className="line-button mx-auto" onClick={retryMap}><RotateCcw size={15} /> 重新加载地图</button>}</div></div>}</div><aside className="location-picker-selection absolute right-4 top-4 z-10 w-[min(17rem,calc(100%-2rem))] border border-[#dedad0] bg-[#f8f5ec]/92 p-3 shadow-xl backdrop-blur-sm sm:right-6 sm:top-6 sm:w-[min(17rem,calc(100%-3rem))]"><span className="eyebrow">选点状态</span><h4 className="serif mt-1 max-h-10 overflow-hidden text-sm text-[#292b2a]">{selection?.formatted || "点击地图选择位置"}</h4><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-[#65796b]"><div><dt>纬度（北正南负）</dt><dd className="mt-1 font-medium text-[#292b2a]">{selection ? selection.latitude.toFixed(4) : "—"}</dd></div><div><dt>经度（东正西负）</dt><dd className="mt-1 font-medium text-[#292b2a]">{selection ? selection.longitude.toFixed(4) : "—"}</dd></div><div className="hidden"><dt>时区（UTC 偏移）</dt><dd className="mt-1">确认选点后，系统将结合出生日期与时刻自动计算</dd></div></dl></aside></div></section></div> }

function Landing({ onStart, onModule }: { onStart: () => void; onModule: () => void }) { return <div className="paper-bg landing ink-landing"><nav className="landing-nav"><a className="brand" href="#top"><span className="brand-seal">观</span><span className="brand-copy"><strong>观星录</strong><small>VEDIC · JYOTISH</small></span></a><div className="nav-session-note"><ShieldCheck size={14} /> 无账号 · 无存档</div></nav><section id="top" className="landing-hero"><div className="hero-wording"><div className="eyebrow">TEMPORARY · PRIVATE BY DESIGN</div><h1 className="hero-title">观星有<em>境</em><br />当下成卷</h1><p className="hero-copy">以吠陀占星为经，以宋画留白与墨色层次为形。输入只用于本次计算；不创建账号、不保存资料，离开页面便回归空白。</p><div className="hero-actions"><button className="ink-button" onClick={onStart}>开始临时排盘 <ArrowRight size={16} /></button><button className="line-button" onClick={onModule}>查看十项分析</button></div><div className="hero-note"><Landmark size={16} /><span>本命、Prashna、Tajika 与 KP 各自运行；报告只在当前会话显示。计算期间必要输入会发送至分析服务，但应用不会建立账户或保存历史档案。</span></div></div></section><section id="modules" className="landing-modules"><div className="scroll-head"><div><div className="eyebrow">A TEN-FOLD STUDY</div><h2>一席临时观照，十种分析路径</h2></div><span className="mono text-[.65rem] text-[#65796b]">NO ACCOUNT REQUIRED</span></div><div className="module-strip">{MODULES.map(item => <div key={item.id}><span>{item.code}</span><strong>{item.label}</strong><small>{item.description}</small></div>)}</div><div className="landing-principles"><div><span>01</span><strong>临时</strong><p>不建立个人档案，不保留星盘、报告或上传文件。</p></div><div><span>02</span><strong>分流</strong><p>Prashna 与 KP 坚持独立数据边界，不混用本命输入。</p></div><div><span>03</span><strong>可复核</strong><p>以 Lahiri、整宫、月宿与 Graha Drishti 等可见规则呈现边界。</p></div></div></section></div> }

function ModelConfigCard({ value, onChange, onClose }: { value: Required<TemporaryModelConfig>; onChange: (next: Required<TemporaryModelConfig>) => void; onClose: () => void }) { const info = MODEL_PROVIDERS[value.provider]; const chooseProvider = (nextProvider: string) => { const provider = nextProvider as ModelProviderId; const next = MODEL_PROVIDERS[provider]; onChange({ provider, model: next.defaultModel, apiKey: "" }); }; return <section className="model-config-card" role="dialog" aria-label="本次会话模型配置"><header><div><span className="eyebrow">MODEL · THIS SESSION ONLY</span><strong>模型配置</strong></div><button type="button" aria-label="关闭模型配置" onClick={onClose}><X size={16} /></button></header><p>默认使用 Agnes AI。选择其他模型时，密钥仅在本次请求中经安全代理转发，不会保存、显示在报告或写入浏览器存储；中转服务仅使用预设可信端点。</p><label className="label">供应商</label><LinearSelect value={value.provider} ariaLabel="模型供应商" onChange={chooseProvider} options={Object.entries(MODEL_PROVIDERS).map(([provider, item]) => ({ value: provider, label: item.label }))} /><label className="label mt-4">模型名称</label><input className="field" value={value.model} onChange={event => onChange({ ...value, model: event.target.value })} placeholder={info.defaultModel || "例如：gpt-4.1-mini"} />{value.provider !== "agnes" ? <><label className="label mt-4">临时 API Key</label><input className="field" type="password" autoComplete="off" value={value.apiKey} onChange={event => onChange({ ...value, apiKey: event.target.value })} placeholder="仅在本次页面会话与请求中使用" /><small>不会写入本地存储；清除本次会话或刷新页面后即移除。</small></> : <div className="model-config-card__default"><Bot size={15} /><span>Agnes 默认模型由部署环境变量保护；浏览器不会接触或保存默认密钥。</span></div>}<footer><button type="button" className="line-button" onClick={() => onChange(defaultModelDraft())}>恢复 Agnes 默认</button><button type="button" className="ink-button" onClick={onClose}>完成</button></footer></section> }

function MemoryRail({ reports, showAll, onToggle, onOpen }: { reports: MemoryReport[]; showAll: boolean; onToggle: () => void; onOpen: (report: MemoryReport) => void }) { return <><div className="flex items-center justify-between"><h3>本次卷轴</h3><span className="mono text-[.6rem] text-[#77746d]">{reports.length}</span></div><p className="rail-note">仅存在于当前页面内存；刷新即清除。</p><div className={showAll ? "report-list report-list--expanded" : "report-list"} tabIndex={showAll ? 0 : -1} role={showAll ? "region" : undefined} aria-label={showAll ? "本次卷轴列表；可用方向键、Page Up、Page Down、Home 和 End 键滚动" : undefined} onKeyDown={showAll ? scrollWithKeyboard : undefined}>{reports.slice(0, showAll ? undefined : 5).map(report => <button key={report.id} className="report-item" onClick={() => onOpen(report)}><span>{report.stack.toUpperCase()} · {formatDate(report.createdAt)}</span><strong>{report.title}</strong></button>)}{reports.length === 0 && <div className="empty-inline">本次运行分析后，卷轴会暂时显示在这里。</div>}</div>{reports.length > 5 && <button className="archive-toggle" onClick={onToggle}>{showAll ? "收起本次卷轴" : `查看全部 ${reports.length} 条`}</button>}</> }
function IsolatedStackRail({ stack, reports, showAll, onToggle, onOpen }: { stack: "prashna" | "kp"; reports: MemoryReport[]; showAll: boolean; onToggle: () => void; onOpen: (report: MemoryReport) => void }) { const title = stack === "prashna" ? "Prashna 临时卷轴" : "KP 临时卷轴"; return <><div className="isolated-rail-seal" aria-hidden="true"><span>{stack === "prashna" ? "问" : "KP"}</span></div><h3>{title}</h3><p>此处不展示本命盘、出生资料或其他分析栈的结果；内容仅在当前页面会话短暂存在。</p><div className="audit-card"><span>隔离规则</span><p>{stack === "prashna" ? "只使用本次地点、系统当前时刻与单一问题。" : "只使用明确选择的 Horary 编号与本次提供的 KP 资料。"}</p></div><hr className="soft-rule" /><MemoryRail reports={reports} showAll={showAll} onToggle={onToggle} onOpen={onOpen} /></> }
function IntroLayout({ children }: { children: React.ReactNode }) { return <>{children}<div className="form-actions"><p className="form-hint">所有输入只用于当前页面内存与本次计算请求；应用不建立账号、不写入档案、不保留历史记录。AI 文本会标示盘面观察、限制与待验证点。</p></div></> }
function NatalPanel({ birth, setBirth, calculate, resolvePlace, resolvingPlace, busy }: { birth: BirthDraft; setBirth: (value: BirthDraft) => void; calculate: () => void; resolvePlace: () => void; resolvingPlace: boolean; busy: boolean }) { return <IntroLayout><BirthForm value={birth} onChange={setBirth} onResolvePlace={resolvePlace} resolvingPlace={resolvingPlace} /><BirthAudit value={birth} /><div className="form-actions"><p className="form-hint">完成地点定位后，系统会依据出生日期、时刻与经纬度自动确定对应的 UTC 偏移；时区字段仅供复核，不能手动修改。页面不会保存任何输入。系统以 Lahiri 动态近似值建立本次恒星黄道工作盘。</p><button className="ink-button" disabled={busy} onClick={calculate}>{busy ? <Loader2 className="animate-spin" size={16} /> : <Orbit size={16} />} 计算本次工作盘</button></div></IntroLayout> }
function BirthAudit({ value }: { value: BirthDraft }) { const hasCoordinates = Boolean(value.place && value.latitude !== "" && value.longitude !== ""); const hasTimezone = hasCoordinates && value.timezoneOffset !== ""; const rows = [{ label: "出生时刻", ready: Boolean(value.date && value.time), note: value.date && value.time ? `已填日期与时间 · ${value.timeAccuracy}` : "需要出生日期与时刻" }, { label: "地点与时区", ready: hasTimezone, note: hasTimezone ? `经纬度与 ${formatUtcOffset(value.timezoneOffset)}（${Number(value.timezoneOffset)} 分钟）` : hasCoordinates ? "地点已定位；等待出生日期与时刻以自动确定时区" : "需要地点、经纬度与时区" }, { label: "时间来源", ready: value.timeSource !== "家庭回忆 / 大概时间", note: value.timeSource === "家庭回忆 / 大概时间" ? "回忆来源：建议结合校时事件" : value.timeSource }, { label: "记录口径", ready: value.timeBasis !== "unknown", note: value.timeBasis === "wall_clock" ? "当时钟表显示时间" : value.timeBasis === "standard_time" ? "未调快的标准时间" : "需要确认钟表口径" }]; return <section className="birth-audit" aria-label="出生资料完整性"><div className="birth-audit__head"><div className="eyebrow">INPUT AUDIT</div><span>非评分式检查</span></div><div className="birth-audit__grid">{rows.map(row => <div key={row.label} className={row.ready ? "is-ready" : "is-pending"}><span>{row.ready ? "已具备" : "待补充"}</span><strong>{row.label}</strong><small>{row.note}</small></div>)}</div><p>这里仅提示计算与复核所需资料，不将资料完整度解释为命盘“好坏”。分盘、Dasha、SAV/BAV 等未计算项会在报告中明确标注。</p></section> }
function usePaperPickerRoot() { const root = useRef<HTMLDivElement>(null); const [open, setOpen] = useState(false); useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []); return { root, open, setOpen }; }
function PaperDatePicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) { const parsed = value ? new Date(`${value}T00:00:00`) : null; const [cursor, setCursor] = useState(() => parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()); const [periodMode, setPeriodMode] = useState(false); const [yearInput, setYearInput] = useState(() => String(cursor.getFullYear())); const { root, open, setOpen } = usePaperPickerRoot(); useEffect(() => { if (parsed && !Number.isNaN(parsed.getTime())) setCursor(parsed); }, [value]); const year = cursor.getFullYear(); const month = cursor.getMonth(); useEffect(() => { if (!periodMode) setYearInput(String(year)); }, [year, periodMode]); const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; const daysInMonth = new Date(year, month + 1, 0).getDate(); const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => { const day = index - firstWeekday + 1; return day > 0 && day <= daysInMonth ? day : null; }); const selectDay = (day: number) => { onChange(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`); setOpen(false); }; const setPeriod = (targetMonth = month) => { const targetYear = Math.min(9999, Math.max(1, Number(yearInput) || year)); setCursor(new Date(targetYear, targetMonth, 1)); setPeriodMode(false); }; const today = new Date(); return <div className={`paper-picker paper-date-picker${open ? " is-open" : ""}`} ref={root}><button type="button" className="paper-picker__trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(current => !current)}><span>{value || "选择日期"}</span><CalendarDays aria-hidden="true" /></button>{open && <div className="paper-picker__menu paper-date-picker__menu" role="dialog" aria-label={`${ariaLabel}选择器`}><header><button type="button" aria-label="上一个月" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft /></button><button type="button" className="paper-date-picker__period" aria-label="选择年份和月份" onClick={() => setPeriodMode(current => !current)}>{year}年{month + 1}月</button><button type="button" aria-label="下一个月" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight /></button></header>{periodMode ? <section className="paper-date-picker__period-panel" aria-label="选择年份和月份"><div><label>年份<input aria-label="年份" inputMode="numeric" value={yearInput} onChange={event => setYearInput(event.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={event => { if (event.key === "Enter") setPeriod(); }} /></label><button type="button" onClick={() => setPeriod()}>前往</button></div><p>选择月份</p><div className="paper-date-picker__months">{Array.from({ length: 12 }, (_, index) => index).map(item => <button key={item} type="button" className={item === month && Number(yearInput || year) === year ? "is-selected" : ""} onClick={() => setPeriod(item)}>{item + 1}月</button>)}</div></section> : <><div className="paper-date-picker__week">{["一", "二", "三", "四", "五", "六", "日"].map(day => <span key={day}>{day}</span>)}</div><div className="paper-date-picker__grid">{cells.map((day, index) => { const selected = day !== null && value === `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; const isToday = day !== null && year === today.getFullYear() && month === today.getMonth() && day === today.getDate(); return day === null ? <span key={`blank-${index}`} /> : <button key={`day-${day}`} type="button" className={`${selected ? "is-selected" : ""}${isToday ? " is-today" : ""}`} onClick={() => selectDay(day)}>{day}</button>; })}</div></>}<footer><button type="button" onClick={() => onChange("")}>清空</button><button type="button" onClick={() => { setCursor(today); selectDay(today.getDate()); }}>今天</button></footer></div>}</div> }
function PaperTimePicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) { const { root, open, setOpen } = usePaperPickerRoot(); const [hour, minute] = /^\d{2}:\d{2}$/.test(value) ? value.split(":") : ["12", "00"]; const choose = (nextHour: string, nextMinute: string) => onChange(`${nextHour}:${nextMinute}`); return <div className={`paper-picker paper-time-picker${open ? " is-open" : ""}`} ref={root}><button type="button" className="paper-picker__trigger" aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(current => !current)}><span>{value || "选择时间"}</span><Clock3 aria-hidden="true" /></button>{open && <div className="paper-picker__menu paper-time-picker__menu" role="dialog" aria-label={`${ariaLabel}选择器`}><header><span>选择时刻</span><button type="button" onClick={() => setOpen(false)}>完成</button></header><div className="paper-time-picker__columns"><div><span>时</span><div tabIndex={0} role="region" aria-label="小时列表；可用方向键、Page Up、Page Down、Home 和 End 键滚动" onKeyDown={scrollWithKeyboard}>{Array.from({ length: 24 }, (_, item) => String(item).padStart(2, "0")).map(item => <button type="button" className={item === hour ? "is-selected" : ""} key={item} onClick={() => choose(item, minute)}>{item}</button>)}</div></div><div><span>分</span><div tabIndex={0} role="region" aria-label="分钟列表；可用方向键、Page Up、Page Down、Home 和 End 键滚动" onKeyDown={scrollWithKeyboard}>{Array.from({ length: 60 }, (_, item) => String(item).padStart(2, "0")).map(item => <button type="button" className={item === minute ? "is-selected" : ""} key={item} onClick={() => choose(hour, item)}>{item}</button>)}</div></div></div></div>}</div> }
function LinearSelect({ value, options, onChange, ariaLabel }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; ariaLabel: string }) { const [open, setOpen] = useState(false); const root = useRef<HTMLDivElement>(null); useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []); const current = options.find(option => option.value === value)?.label || value; return <div className={`linear-select${open ? " is-open" : ""}`} ref={root}><button type="button" className="linear-select__trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}><span>{current}</span><ChevronDown aria-hidden="true" /></button>{open && <div className="linear-select__menu" role="listbox" aria-label={ariaLabel}>{options.map(option => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "is-selected" : ""} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}><span>{option.label}</span>{option.value === value && <Check aria-hidden="true" />}</button>)}</div>}</div> }
function ChartRail({ chart }: { chart: VedicChartData }) { const method = chart.ayanamsa.method.trim(); return <div className="chart-rail"><header className="chart-rail__head"><div><span>D1 · TEMPORARY CHART</span><h3>本命结构</h3><p>{chart.birth.place}</p></div><time>{chart.birth.date}<br />{chart.birth.time}</time></header><div className="chart-rail__diagram"><VedicChart chart={chart} /></div><div className="chart-summary"><div><span>上升</span><strong>{chart.lagna.signZh}座 {chart.lagna.degreeInSign.toFixed(2)}°</strong><small>恒星黄道 · Lahiri</small></div><div><span>月亮</span><strong>{chart.summary.moonSign}</strong></div><div><span>星宿</span><strong>{chart.summary.moonNakshatra}</strong></div></div><section className="chart-rail__method"><header><span>CALCULATION SCOPE</span><strong>计算范围</strong></header><p>{chart.audit?.calculationScope?.join(" · ") || "本次临时工作盘"}</p><div className="chart-rail__limit"><span>暂未计算</span><p>{chart.audit?.excludedFromThisChart?.slice(0, 3).join("、") || "未标注"}</p></div></section><section className="chart-rail__note"><span>METHOD NOTE</span><p>{method.endsWith("。") ? method : `${method}。`}全宫制显示；专业咨询前应与权威星历或软件复核。</p></section></div> }
function BirthForm({ value, onChange, prefix = "", onResolvePlace, resolvingPlace }: { value: BirthDraft; onChange: (value: BirthDraft) => void; prefix?: string; onResolvePlace?: () => void; resolvingPlace?: boolean }) { const update = (key: keyof BirthDraft, val: string) => onChange({ ...value, [key]: val }); return <div className="form-grid"><div><label className="label">{prefix}姓名 / 临时标记</label><input className="field" value={value.name} onChange={e => update("name", e.target.value)} placeholder="仅用于本次页面显示" /></div><div><label className="label">时间精度</label><LinearSelect ariaLabel="时间精度" value={value.timeAccuracy} onChange={next => update("timeAccuracy", next)} options={["精确到分钟", "±15分钟", "±1小时", "不确定"].map(item => ({ value: item, label: item }))} /></div><div><label className="label">出生日期</label><PaperDatePicker ariaLabel="出生日期" value={value.date} onChange={next => update("date", next)} /></div><div><label className="label">出生时间</label><PaperTimePicker ariaLabel="出生时间" value={value.time} onChange={next => update("time", next)} /></div><div><label className="label">时间来源</label><LinearSelect ariaLabel="时间来源" value={value.timeSource} onChange={next => update("timeSource", next)} options={["出生证明 / 医院记录", "家人当场看钟", "家庭回忆 / 大概时间", "身份证 / 转抄记录", "剖腹产手术记录"].map(item => ({ value: item, label: item }))} /></div><div><label className="label">记录时间口径</label><LinearSelect ariaLabel="记录时间口径" value={value.timeBasis} onChange={next => update("timeBasis", next)} options={[{ value: "wall_clock", label: "当时钟表显示时间" }, { value: "standard_time", label: "未调快的标准时间" }, { value: "unknown", label: "不确定" }]} /></div><div className="form-span"><label className="label">出生地点</label><div className="place-field"><input className="field" value={value.place} onChange={e => update("place", e.target.value)} placeholder="例如：昆明市；边界地区可填写区县" />{onResolvePlace && <button type="button" className="line-button text-xs shrink-0" onClick={onResolvePlace} disabled={resolvingPlace}>{resolvingPlace ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />} 定位</button>}</div></div><div><label className="label">纬度（北正南负）</label><input className="field" type="number" onWheel={blurNumberInputOnWheel} step="0.0001" value={value.latitude} onChange={e => update("latitude", e.target.value)} placeholder="31.2304" /></div><div><label className="label">经度（东正西负）</label><input className="field" type="number" onWheel={blurNumberInputOnWheel} step="0.0001" value={value.longitude} onChange={e => update("longitude", e.target.value)} placeholder="121.4737" /></div><div className="form-span"><label className="label">时区（UTC 偏移）</label><div className="place-field"><input className="field bg-[#f1efe8] text-[#77746d]" type="text" value={value.timezoneOffset === "" ? "定位后自动回填" : `${value.timezoneOffset} 分钟`} readOnly aria-readonly="true" /><span className="shrink-0 text-right text-xs text-[#65796b]">{value.timezoneOffset === "" ? "尚未确定" : formatUtcOffset(value.timezoneOffset)}<br />东正西负 · 分钟</span></div><p className="mt-2 text-xs text-[#77746d]">完成地点定位并填写出生日期与时刻后，系统会根据经纬度与历史时区规则自动回填；该数值仅供复核，不能手动修改。</p></div></div> }
function ReaderPanel({ busy, fileName, uploadRef, onUpload }: { busy: boolean; fileName: string; uploadRef: React.RefObject<HTMLInputElement | null>; onUpload: (file?: File) => void }) { return <IntroLayout><input ref={uploadRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e => onUpload(e.target.files?.[0])} /><button className="upload-zone w-full" disabled={busy} onClick={() => uploadRef.current?.click()}><UploadCloud size={25} className="text-[#65796b]" /><strong>{fileName || "选择星盘截图或 PDF"}</strong><span>PNG · JPG · WEBP · PDF，单个文件不超过 7MB；仅用于本次请求</span>{busy && <Loader2 size={16} className="animate-spin" />}</button><div className="two-col mt-4"><div className="empty-inline"><strong className="serif text-[#292b2a]">临时处理</strong><br />原始文件只会随本次分析请求处理，不写入档案、文件库或本地浏览器存储。</div><div className="empty-inline"><strong className="serif text-[#292b2a]">数据优先级</strong><br />完整出生时空可重算时，<b>计算盘为主</b>；图片/PDF 是交叉校对层。不可确认字段始终保留为待确认。</div></div></IntroLayout> }
function CorePanel({ busy, question, setQuestion, run }: { busy: boolean; question: string; setQuestion: (s: string) => void; run: () => void }) { return <IntroLayout><div className="module-cards">{Array.from({ length: 12 }, (_, i) => <div className="module-card" key={i}><span>P{String(i + 1).padStart(2, "0")}</span><strong>第 {i + 1} 宫 · {["自我", "资源", "行动", "家园", "才华", "修复", "关系", "转化", "信念", "事业", "社群", "内在"][i]}</strong></div>)}</div><div className="empty-inline mb-4"><strong className="serif text-[#292b2a]">D1 十二宫基础概览</strong><br />当前报告逐宫解释 D1 工作盘，不等同于技能包中含 Shadbala、SAV/BAV、分盘、Dasha 与 Yoga 的完整 P1–P12 行星审计；未计算项会明确标注。</div><label className="label">想优先询问的生活主题（可选）</label><textarea className="field min-h-24 resize-y" value={question} onChange={e => setQuestion(e.target.value)} placeholder="例如：我想先理解第十宫与第七宫如何相互牵动。" /><ActionRow busy={busy} run={run} icon={<BookOpen size={16} />} label="生成 D1 十二宫概览" note="报告按 P1–P12 的十二段展开，先给盘面结构，再明确限制与待验证点；仅保留在本次会话。" /></IntroLayout> }
function SpecialPanel({ type, busy, question, setQuestion, run }: { type: "career" | "love"; busy: boolean; question: string; setQuestion: (s: string) => void; run: () => void }) { const career = type === "career"; return <IntroLayout><div className="two-col"><div className="empty-inline"><strong className="serif text-[#292b2a]">{career ? "职业观察线" : "关系观察线"}</strong><br />{career ? "第十宫、宫主、关键行星与公众角色的组合被作为专题输入。" : "第七宫、宫主、关系轴与伴侣主题被作为专题输入。"}</div><div className="empty-inline"><strong className="serif text-[#292b2a]">AI 成文方式</strong><br />以盘面观察为依据，单列反证和不确定处；不将象征性结构等同于职业或关系事实。</div></div><label className="label mt-5">你希望讨论的具体问题（可选）</label><textarea className="field min-h-28 resize-y" value={question} onChange={e => setQuestion(e.target.value)} placeholder={career ? "例如：我在什么类型的工作场景更容易建立影响力？" : "例如：我在亲密关系中最需要留意什么互动模式？"} /><ActionRow busy={busy} run={run} icon={career ? <BriefcaseBusiness size={16} /> : <Heart size={16} />} label="生成本次专项解读" note="本次专项结果不会写入档案或在刷新后保留。" /></IntroLayout> }
function RectificationPanel({ busy, preview, events, setEvents, run }: { busy: boolean; preview?: { candidates: RectificationCandidate[]; summary: { note: string; lagnaVariants: string[]; moonNakshatraVariants: string[] } }; events: string; setEvents: (s: string) => void; run: () => void }) { return <IntroLayout><div className="empty-inline mb-4"><strong className="serif text-[#292b2a]">候选比较，而非分钟级结论</strong><br />记录具有日期或阶段边界的重要事件。当前模块生成 D1 候选盘并保留支持与反证；尚未实现完整 Dasha 评分矩阵及 D9→D10 精调，因此不会声明已校准至分钟。</div>{preview && <div className="candidate-block"><div className="eyebrow">CANDIDATE COMPARISON</div><p>{preview.summary.note}</p><div className="candidate-list">{preview.candidates.map(item => <div key={item.offsetMinutes}><span>{item.offsetMinutes >= 0 ? "+" : ""}{item.offsetMinutes} MIN</span><strong>{item.localDate} · {item.localTime}</strong><small>{item.discriminator}</small></div>)}</div></div>}<label className="label mt-5">重要事件与时间线</label><textarea className="field rectification-events resize-y" value={events} onChange={e => setEvents(e.target.value)} placeholder={"请按一行一个事件填写，例如：\n2015-09｜毕业并进入第一份全职工作｜日期精度：月\n2019-06｜迁居｜日期精度：月\n2022-11｜结束长期关系｜日期精度：月"} /><ActionRow busy={busy} run={run} icon={<RotateCcw size={16} />} label="生成候选比较" note="至少需要五条独立事件；事件材料仅用于本次候选比较。" disabled={!events.trim()} /></IntroLayout> }
function SynastryPanel({ busy, preview, partner, setPartner, question, setQuestion, hasChart, resolvePartnerPlace, resolvingPartnerPlace, run }: { busy: boolean; preview: { overlays: SynastryOverlay[]; drishti: SynastryDrishti[]; moonScreening: { aNakshatra: string; bNakshatra: string; taraDistance: number; note: string }; methodology: string } | null; partner: BirthDraft; setPartner: (v: BirthDraft) => void; question: string; setQuestion: (s: string) => void; hasChart: boolean; resolvePartnerPlace: () => void; resolvingPartnerPlace: boolean; run: () => void }) { return <IntroLayout>{!hasChart && <div className="empty-inline mb-4">请先在“出生信息排盘”完成本次本命盘。此模块不会用关系描述替代任何一方的出生数据。</div>}<div className="eyebrow mb-3">PERSON B · BIRTH DATA</div><BirthForm value={partner} onChange={setPartner} prefix="对方" onResolvePlace={resolvePartnerPlace} resolvingPlace={resolvingPartnerPlace} />{preview && <div className="synastry-grid"><div><div className="eyebrow">DIRECTIONAL OVERLAYS</div>{preview.overlays.slice(0, 6).map((item, i) => <p key={i}><strong>{item.direction} · {item.planet}</strong> 落入对方第 {item.targetHouse} 宫（{item.targetTheme}）</p>)}</div><div><div className="eyebrow">GRAHA DRISHTI</div>{preview.drishti.slice(0, 5).map((item, i) => <p key={i}><strong>{item.direction}</strong> · {item.sourcePlanet} → {item.targetPlanet}<br />{item.note}</p>)}<small>{preview.moonScreening.note}<br />A {preview.moonScreening.aNakshatra} / B {preview.moonScreening.bNakshatra}（Tara 距离 {preview.moonScreening.taraDistance}）</small></div></div>}<label className="label mt-5">关系提问（可选）</label><textarea className="field min-h-24 resize-y" value={question} onChange={e => setQuestion(e.target.value)} placeholder="例如：我们在沟通与空间需求上可能有哪些不同节律？" /><ActionRow busy={busy} run={run} icon={<UsersRound size={16} />} label="建立本次双人合盘" note="按双向整宫投射、Graha Drishti 与月宿筛查讨论交点；不使用西方相位或合成盘。" /></IntroLayout> }
function PrashnaPanel({ busy, location, setLocation, resolvePlace, question, setQuestion, run }: { busy: boolean; location: typeof initialPrashnaLocation; setLocation: (v: typeof initialPrashnaLocation) => void; resolvePlace: () => void; question: string; setQuestion: (s: string) => void; run: () => void }) { return <IntroLayout><div className="empty-inline mb-4"><strong className="serif text-[#292b2a]">完全隔离的基础时盘</strong><br />起盘时刻由系统当前时间生成。此处地点状态独立于出生资料；不读取、也不引用本命盘、合盘、Tajika 或 KP 内容。当前仅生成 D1 白名单事实与规则所需资料；古典 rule_id 账本未完整实现，因此不输出“成／悬／不成”裁决。</div><div className="form-span"><label className="label">本次起盘地点</label><div className="place-field"><input className="field" value={location.place} onChange={e => setLocation({ ...location, place: e.target.value })} placeholder="例如：昆明市；边界地区可填写区县" /><button type="button" className="line-button text-xs shrink-0" onClick={resolvePlace}><MapPin size={13} /> 定位</button></div><p className="mt-2 text-xs text-[#77746d]">城市级地点通常足够；跨城、国界／时区边界或上升接近星座交界时，建议补至区县或街道。无需填写门牌号。</p></div><div className="two-col mt-4"><div><label className="label">纬度（北正南负）</label><input className="field" type="number" onWheel={blurNumberInputOnWheel} step="0.0001" value={location.latitude} onChange={e => setLocation({ ...location, latitude: e.target.value })} placeholder="31.2304" /></div><div><label className="label">经度（东正西负）</label><input className="field" type="number" onWheel={blurNumberInputOnWheel} step="0.0001" value={location.longitude} onChange={e => setLocation({ ...location, longitude: e.target.value })} placeholder="121.4737" /></div><div><label className="label">时区（UTC 偏移）</label><div className="place-field"><input className="field" type="number" onWheel={blurNumberInputOnWheel} value={location.timezoneOffset} onChange={e => setLocation({ ...location, timezoneOffset: e.target.value })} /><span className="shrink-0 text-right text-xs text-[#65796b]">{formatUtcOffset(location.timezoneOffset)}<br />东正西负 · 分钟</span></div></div><div className="empty-inline"><strong className="serif text-[#292b2a]">地点精度</strong><br />经纬度直接参与上升点与整宫计算；自动定位会回填 4 位小数。若上升点不靠近星座交界，城市中心与区县坐标通常不会改变宫位结构。</div></div><label className="label mt-5">你要问的问题</label><textarea className="field min-h-28 resize-y" value={question} onChange={e => setQuestion(e.target.value)} placeholder="例如：我接受这份 offer 后能否顺利入职？" /><ActionRow busy={busy} run={run} icon={<Compass size={16} />} label="生成基础时盘核对" note="问题须是一个可观察结果；本时盘使用系统当前时刻与已定位的地点，经纬度和时区均可在起盘前复核。" disabled={!question.trim()} /></IntroLayout> }
function TajikaPanel({ busy, year, setYear, run }: { busy: boolean; year: string; setYear: (s: string) => void; run: () => void }) { return <IntroLayout><div className="two-col"><div className="empty-inline"><strong className="serif text-[#292b2a]">年度太阳回归工作点</strong><br />系统匹配本命太阳的回归黄经时刻，再以该时刻与出生地点建立年度 D1 工作盘，并与本命基础对照。</div><div className="empty-inline"><strong className="serif text-[#292b2a]">边界</strong><br />当前未实现 Tajika 十六 Yoga、deeptamsha 或 applying/separating，因此不把本模块称为完整 Tajika 判读；年度层也不覆盖本命结构。</div></div><label className="label mt-5">目标年度</label><input className="field max-w-xs" type="number" onWheel={blurNumberInputOnWheel} value={year} onChange={e => setYear(e.target.value)} /><ActionRow busy={busy} run={run} icon={<SunMedium size={16} />} label="生成年度回归工作点说明" note="本次计算会标注回归黄经偏差；高风险决策前应以专业星历独立复核。" /></IntroLayout> }
function KpPanel({ busy, question, setQuestion, extraContext, setExtraContext, table, kpNumber, setKpNumber, run }: { busy: boolean; question: string; setQuestion: (s: string) => void; extraContext: string; setExtraContext: (s: string) => void; table: KpSubLordRow[]; kpNumber: string; setKpNumber: (s: string) => void; run: () => void }) { const selectedIndex = Number(kpNumber); return <IntroLayout><div className="empty-inline mb-4"><strong className="serif text-[#292b2a]">KP 1–249 独立资料核对</strong><br />请明确选择时占编号。系统不会从问题文字、时刻或随机方式代取号码；当前仅提供编号、星宿、星主与子主资料核对。未实现 Krishnamurti ayanamsa、号码 Asc、Placidus cusps、significator、RP 与 period，因此不输出经典 KP promise 或 timing。</div><div className="two-col"><div><label className="label">KP 时占编号</label><input className="field" type="number" onWheel={blurNumberInputOnWheel} min="1" max="249" value={kpNumber} onChange={e => setKpNumber(e.target.value)} /></div><div className="empty-inline"><strong className="serif text-[#292b2a]">独立栈边界</strong><br />KP 不读取本命、卜问或年度推运的结论；所有内容只在本次页面会话短暂存在。</div></div><div className="kp-table" tabIndex={0} role="region" aria-label="KP 1 至 249 时占资料表；可用方向键、Page Up、Page Down、Home 和 End 键滚动" onKeyDown={scrollWithKeyboard}><div className="kp-table__head"><span>编号</span><span>星座</span><span>起始度数</span><span>结束度数</span><span>星宿</span><span>星主</span><span>子主</span></div>{table.map(row => <div key={row.index} className={row.index === selectedIndex ? "is-selected" : ""}><span data-label="编号">{row.index}</span><span data-label="星座">{kpDegreeLabel(row.start).split(" ")[0]}</span><span data-label="起始度数">{kpDegreeLabel(row.start)}</span><span data-label="结束度数">{kpDegreeLabel(row.end)}</span><span data-label="星宿">{KP_NAKSHATRAS_ZH[row.nakshatra] || row.nakshatra}</span><span data-label="星主">{KP_GRAHAS_ZH[row.starLord] || row.starLord}</span><span data-label="子主">{KP_GRAHAS_ZH[row.subLord] || row.subLord}</span></div>)}<p>当前完整展示 {table.length} 条 KP 1–249 时占资料；所选编号与说明不会保存。</p></div><label className="label mt-5">KP 问题</label><textarea className="field min-h-24 resize-y" value={question} onChange={e => setQuestion(e.target.value)} placeholder="例如：请列出当前编号的可核对资料与仍缺字段。" /><label className="label mt-5">可补充的 KP 资料（可选）</label><textarea className="field min-h-36 resize-y" value={extraContext} onChange={e => setExtraContext(e.target.value)} placeholder="可粘贴宫位子主、指示星、统治星或运限资料中的相关条目。" /><ActionRow busy={busy} run={run} icon={<Grid2X2 size={16} />} label="生成 KP 资料缺口说明" note="本次 KP 输入不与其他模块共享，也不会保留到刷新之后。" disabled={!question.trim() || Number(kpNumber) < 1 || Number(kpNumber) > 249} /></IntroLayout> }
function ActionRow({ busy, run, icon, label, note, disabled }: { busy: boolean; run: () => void; icon: React.ReactNode; label: string; note: string; disabled?: boolean }) { return <div className="form-actions"><p className="form-hint">{note}</p><button className="ink-button" disabled={busy || disabled} onClick={run}>{busy ? <Loader2 className="animate-spin" size={16} /> : icon}{label}</button></div> }
function introFor(id: ModuleKey) { const copy: Record<ModuleKey, string> = { natal: "从出生日期、时刻、地点、经纬度与时区建立本次恒星黄道 D1 基础工作盘。", reader: "把 PDF 或截图用于一次性识读；不会保存原件、提取记录或报告。", p1p12: "将 D1 十二 Bhava 展开为有盘面依据、也有局限说明的基础概览。", rectification: "以候选比较、事件精度与反证为核心；当前不将结果表述为分钟级校时。", career: "围绕第十宫及其相关结构，对工作环境、角色感与职业表达做专题整理。", love: "围绕第七宫及其相关结构，对关系节律与伴侣主题做专题整理。", synastry: "输入二人的出生资料后，先分别理解，再审慎讨论交会之处。", prashna: "使用当前时刻与地点建立隔离的基础时盘；规则账本未完整实现时不输出古典裁决。", tajika: "定位年度太阳回归工作点，与本命 D1 基础对照；不伪造 Tajika 十六 Yoga。", kp: "KP 的问题、资料与解释完全独立；当前只核对 1–249 资料与缺失字段。" }; return copy[id]; }
