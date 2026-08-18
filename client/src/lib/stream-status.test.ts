import { describe, expect, it } from "vitest";
import { getStreamWaitState } from "./stream-status";

describe("流式等待状态", () => {
  it("按 500ms 与 8 秒阈值提供稳定的前端反馈", () => {
    expect(getStreamWaitState(500, 0)).toBe("writing");
    expect(getStreamWaitState(501, 0)).toBe("waiting");
    expect(getStreamWaitState(8_000, 0)).toBe("waiting");
    expect(getStreamWaitState(8_001, 0)).toBe("long-waiting");
  });

  it("在近期收到无内容心跳时显示连接正常的推理状态", () => {
    expect(getStreamWaitState(2_500, 0, 2_000)).toBe("connected-waiting");
    expect(getStreamWaitState(6_000, 0, 2_000)).toBe("waiting");
  });
});
