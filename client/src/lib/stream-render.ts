import { renderLightMarkdown } from "./light-markdown";

export type StreamRenderTarget = Pick<HTMLElement, "innerHTML" | "insertAdjacentHTML" | "replaceChildren">;

/**
 * 仅将已闭合 Markdown 稳定区中新增加的部分写入 DOM。
 * 当上游要求重写（新文本不再以前一稳定区为前缀）时，才进行一次完整替换。
 */
export function appendStableMarkdown(target: StreamRenderTarget, previousStable: string, nextStable: string) {
  if (nextStable === previousStable) return previousStable;
  if (!nextStable.startsWith(previousStable)) {
    target.innerHTML = renderLightMarkdown(nextStable);
    return nextStable;
  }

  const appendedStable = nextStable.slice(previousStable.length);
  if (appendedStable) target.insertAdjacentHTML("beforeend", renderLightMarkdown(appendedStable));
  return nextStable;
}

export function clearStreamRenderTargets(...targets: Array<StreamRenderTarget | null | undefined>) {
  targets.forEach(target => target?.replaceChildren());
}
