import { describe, expect, it } from "vitest";
import { shouldRedirectWheelToHorizontalScroll } from "./horizontal-wheel";

describe("横向导航滚轮分派", () => {
  it("仅在导航可横向滚动且垂直滚轮应被映射时拦截事件", () => {
    expect(shouldRedirectWheelToHorizontalScroll({ scrollWidth: 900, clientWidth: 420, deltaX: 0, deltaY: 120, shiftKey: false })).toBe(true);
    expect(shouldRedirectWheelToHorizontalScroll({ scrollWidth: 900, clientWidth: 420, deltaX: 30, deltaY: 0, shiftKey: false })).toBe(false);
    expect(shouldRedirectWheelToHorizontalScroll({ scrollWidth: 420, clientWidth: 420, deltaX: 0, deltaY: 120, shiftKey: false })).toBe(false);
  });
});
