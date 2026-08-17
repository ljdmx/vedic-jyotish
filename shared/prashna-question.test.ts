import { describe, expect, it } from "vitest";
import { validatePrashnaQuestion } from "./prashna-question";

describe("validatePrashnaQuestion", () => {
  it("accepts one concrete observable Prashna question", () => {
    expect(validatePrashnaQuestion("我接受这份 offer 后能否顺利入职？")).toEqual({ valid: true, question: "我接受这份 offer 后能否顺利入职？" });
  });

  it("rejects broad, compound, and under-specified questions", () => {
    expect(validatePrashnaQuestion("今天运势怎么样？").valid).toBe(false);
    expect(validatePrashnaQuestion("我能否入职？我能否结婚？").valid).toBe(false);
    expect(validatePrashnaQuestion("帮我看看以后会如何").valid).toBe(false);
  });
});
