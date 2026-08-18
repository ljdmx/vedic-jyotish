import { describe, expect, it } from "vitest";
import { buildPrashnaLocation } from "./prashna-location";

describe("buildPrashnaLocation", () => {
  it("accepts complete temporary Prashna coordinates", () => {
    expect(buildPrashnaLocation({ place: " 中国云南省昆明市 ", latitude: "25.0389", longitude: "102.7183", timezoneOffset: "480" })).toEqual({
      payload: { name: "Prashna", place: "中国云南省昆明市", latitude: 25.0389, longitude: 102.7183, timezoneOffset: 480, timeAccuracy: "当前起盘" },
      error: null,
    });
  });

  it("keeps valid zero-valued coordinates and timezone", () => {
    expect(buildPrashnaLocation({ place: "本初子午线", latitude: "0", longitude: "0", timezoneOffset: "0" }).payload).toMatchObject({ latitude: 0, longitude: 0, timezoneOffset: 0 });
  });

  it("returns a precise reason for absent or invalid location fields", () => {
    expect(buildPrashnaLocation({ place: "", latitude: "25", longitude: "102", timezoneOffset: "480" }).error).toContain("地点");
    expect(buildPrashnaLocation({ place: "昆明", latitude: "north", longitude: "102", timezoneOffset: "480" }).error).toContain("纬度");
    expect(buildPrashnaLocation({ place: "昆明", latitude: "25", longitude: "181", timezoneOffset: "480" }).error).toContain("经度");
    expect(buildPrashnaLocation({ place: "昆明", latitude: "25", longitude: "102", timezoneOffset: "" }).error).toContain("时区");
    expect(buildPrashnaLocation({ place: "昆明", latitude: "25", longitude: "102", timezoneOffset: "900" }).error).toContain("时区");
  });
});
