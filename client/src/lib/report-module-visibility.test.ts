import { describe, expect, it } from "vitest";
import { reportsForModule, shouldShowModuleReport } from "./report-module-visibility";

describe("报告模块隔离", () => {
  it("只在报告所属模块显示工作区抽屉", () => {
    expect(shouldShowModuleReport({ activeModule: "natal", reportModule: "p1p12", hasRenderableReport: true, isPending: false, hasFailure: false })).toBe(false);
    expect(shouldShowModuleReport({ activeModule: "p1p12", reportModule: "p1p12", hasRenderableReport: true, isPending: false, hasFailure: false })).toBe(true);
    expect(shouldShowModuleReport({ activeModule: "career", reportModule: "career", hasRenderableReport: false, isPending: true, hasFailure: false })).toBe(true);
  });

  it("右侧卷轴仅列出当前模块的归档报告", () => {
    const reports = [{ module: "p1p12", title: "十二宫" }, { module: "career", title: "职业" }, { module: "p1p12", title: "十二宫续" }];
    expect(reportsForModule(reports, "p1p12").map(report => report.title)).toEqual(["十二宫", "十二宫续"]);
  });
});
