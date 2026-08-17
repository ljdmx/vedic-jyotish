import { describe, expect, it } from "vitest";
import { shouldScheduleLocationSearch } from "../client/src/lib/location-search";

describe("地图地址自动检索", () => {
  it("仅为新的、至少两个字符的地址安排检索", () => {
    expect(shouldScheduleLocationSearch("", null)).toBe(false);
    expect(shouldScheduleLocationSearch("昆", null)).toBe(false);
    expect(shouldScheduleLocationSearch(" 昆明市 ", null)).toBe(true);
    expect(shouldScheduleLocationSearch("昆明市", "昆明市")).toBe(false);
    expect(shouldScheduleLocationSearch("云南昆明", "昆明市")).toBe(true);
  });
});
