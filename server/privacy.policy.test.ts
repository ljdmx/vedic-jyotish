import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createTemporaryContext(): TrpcContext {
  return {
    req: { protocol: "https", headers: { cookie: "app_session_id=ignored" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("temporary session boundary", () => {
  it("serves public privacy metadata without reading or clearing an account cookie", async () => {
    const policy = await appRouter.createCaller(createTemporaryContext()).privacy.policy();
    expect(policy).toMatchObject({ retention: "none" });
    expect(policy.statement).toContain("Cookie");
  });
});
