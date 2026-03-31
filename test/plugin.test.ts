import { describe, it, expect, vi } from "vitest";
import { createIdentityPlugin } from "../src/plugin";
import type { IdentityProvider, IdentityResult, AggregatedIdentity } from "../src/types";

// Mock provider factory
function mockProvider(
  name: string,
  result: Partial<IdentityResult> = {}
): IdentityProvider {
  return {
    name,
    verify: vi.fn().mockResolvedValue({
      verified: true,
      provider: name,
      ...result,
    }),
  };
}

function failingProvider(name: string, error = "Connection failed"): IdentityProvider {
  return {
    name,
    verify: vi.fn().mockRejectedValue(new Error(error)),
  };
}

// Extract handler for testing
async function callVerify(
  plugin: ReturnType<typeof createIdentityPlugin>,
  input: { identifier: string; providers?: string[]; checkOnchain?: boolean }
): Promise<AggregatedIdentity> {
  return (plugin.methods as any).verify_agent(
    {} as any, // mock SolanaAgentKit
    input
  );
}

describe("createIdentityPlugin", () => {
  it("creates a valid SAK plugin", () => {
    const plugin = createIdentityPlugin([]);
    expect(plugin.name).toBe("agent-identity");
    expect(plugin.actions).toHaveLength(1);
    expect(plugin.actions[0].name).toBe("VERIFY_AGENT_IDENTITY");
    expect(plugin.methods).toHaveProperty("verify_agent");
  });

  it("includes provider names in action description", () => {
    const plugin = createIdentityPlugin([
      mockProvider("agentpass"),
      mockProvider("agentid"),
    ]);
    expect(plugin.actions[0].description).toContain("agentpass");
    expect(plugin.actions[0].description).toContain("agentid");
  });
});

describe("verify_agent", () => {
  it("aggregates results from multiple providers", async () => {
    const plugin = createIdentityPlugin([
      mockProvider("agentpass", { name: "Kai", trustLevel: 5 }),
      mockProvider("agentid", { name: "Kai", trustLevel: "high" }),
    ]);

    const result = await callVerify(plugin, { identifier: "ap_test123" });

    expect(result.verified).toBe(true);
    expect(result.verifiedCount).toBe(2);
    expect(result.totalProviders).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].provider).toBe("agentpass");
    expect(result.results[1].provider).toBe("agentid");
  });

  it("returns verified=true if ANY provider succeeds", async () => {
    const plugin = createIdentityPlugin([
      mockProvider("agentpass", { verified: true }),
      mockProvider("agentid", { verified: false }),
    ]);

    const result = await callVerify(plugin, { identifier: "test" });

    expect(result.verified).toBe(true);
    expect(result.verifiedCount).toBe(1);
  });

  it("returns verified=false if ALL providers fail", async () => {
    const plugin = createIdentityPlugin([
      mockProvider("agentpass", { verified: false }),
      mockProvider("agentid", { verified: false }),
    ]);

    const result = await callVerify(plugin, { identifier: "unknown" });

    expect(result.verified).toBe(false);
    expect(result.verifiedCount).toBe(0);
  });

  it("handles provider errors gracefully", async () => {
    const plugin = createIdentityPlugin([
      mockProvider("agentpass", { verified: true, name: "Kai" }),
      failingProvider("agentid", "API timeout"),
    ]);

    const result = await callVerify(plugin, { identifier: "test" });

    expect(result.verified).toBe(true);
    expect(result.verifiedCount).toBe(1);
    expect(result.results[1].verified).toBe(false);
    expect(result.results[1].error).toBe("API timeout");
  });

  it("filters by provider names when specified", async () => {
    const ap = mockProvider("agentpass");
    const aid = mockProvider("agentid");
    const plugin = createIdentityPlugin([ap, aid]);

    const result = await callVerify(plugin, {
      identifier: "test",
      providers: ["agentpass"],
    });

    expect(result.totalProviders).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].provider).toBe("agentpass");
    expect(aid.verify).not.toHaveBeenCalled();
  });

  it("passes checkOnchain option to providers", async () => {
    const ap = mockProvider("agentpass");
    const plugin = createIdentityPlugin([ap]);

    await callVerify(plugin, { identifier: "test", checkOnchain: false });

    expect(ap.verify).toHaveBeenCalledWith("test", { checkOnchain: false });
  });

  it("defaults checkOnchain to true", async () => {
    const ap = mockProvider("agentpass");
    const plugin = createIdentityPlugin([ap]);

    await callVerify(plugin, { identifier: "test" });

    expect(ap.verify).toHaveBeenCalledWith("test", { checkOnchain: true });
  });

  it("handles zero providers", async () => {
    const plugin = createIdentityPlugin([]);
    const result = await callVerify(plugin, { identifier: "test" });

    expect(result.verified).toBe(false);
    expect(result.verifiedCount).toBe(0);
    expect(result.totalProviders).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it("handles all providers throwing", async () => {
    const plugin = createIdentityPlugin([
      failingProvider("a", "err1"),
      failingProvider("b", "err2"),
    ]);

    const result = await callVerify(plugin, { identifier: "test" });

    expect(result.verified).toBe(false);
    expect(result.verifiedCount).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.error)).toBe(true);
  });
});

describe("IdentityProvider interface", () => {
  it("supports optional verifyByWallet", async () => {
    const provider: IdentityProvider = {
      name: "test",
      verify: vi.fn().mockResolvedValue({ verified: true, provider: "test" }),
      verifyByWallet: vi.fn().mockResolvedValue({ verified: true, provider: "test" }),
    };

    expect(provider.verifyByWallet).toBeDefined();
  });

  it("supports optional checkCredentials", async () => {
    const provider: IdentityProvider = {
      name: "test",
      verify: vi.fn().mockResolvedValue({ verified: true, provider: "test" }),
      checkCredentials: vi.fn().mockResolvedValue([
        { type: "mva", issuer: "agentpass", subject: "kai" },
      ]),
    };

    const creds = await provider.checkCredentials!("kai");
    expect(creds).toHaveLength(1);
    expect(creds[0].type).toBe("mva");
  });
});
