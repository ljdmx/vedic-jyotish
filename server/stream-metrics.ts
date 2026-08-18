export type StreamMetricsSnapshot = {
  elapsedMs: number;
  timeToFirstDeltaMs: number | null;
  deltaEvents: number;
  characters: number;
  restartEvents: number;
};

/** 仅记录传输时序与事件计数，不收集报告正文、问题或出生资料。 */
export function createStreamMetrics(clock: () => number = () => Date.now()) {
  const startedAt = clock();
  let firstDeltaAt: number | null = null;
  let deltaEvents = 0;
  let characters = 0;
  let restartEvents = 0;

  return {
    markDelta(text: string) {
      if (firstDeltaAt === null) firstDeltaAt = clock();
      deltaEvents += 1;
      characters += text.length;
    },
    markRestart() {
      restartEvents += 1;
    },
    snapshot(): StreamMetricsSnapshot {
      const now = clock();
      return {
        elapsedMs: Math.max(0, now - startedAt),
        timeToFirstDeltaMs: firstDeltaAt === null ? null : Math.max(0, firstDeltaAt - startedAt),
        deltaEvents,
        characters,
        restartEvents,
      };
    },
  };
}
