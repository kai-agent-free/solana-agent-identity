import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { APSProvider } from "../src/providers/aps";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("APSProvider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns verified=true for grade >= minGrade", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agentId: "agent-abc",
        passportGrade: 2,
        flags: ["issuer_bound", "runtime_bound"],
        reputationScore: 0.85,
        delegationDepth: 1,
        attestationBundleHash: "0xabc",
        lastActiveAt: "2026-04-01T00:00:00Z",
      }),
    });

    const provider = new APSProvider({ minGrade: 1 });
    const result = await provider.verify("agent-abc");

    expect(result.verified).toBe(true);
    expect(result.provider).toBe("aps");
    expect(result.trustLevel).toBe(2);
    expect(result.credentials).toHaveLength(2);
    expect(result.credentials![0].type).toBe("issuer_bound");
    expect(result.reputation?.score).toBe(0.85);
    expect(result.reputation?.signals?.passportGrade).toBe(2);
  });

  it("returns verified=false for grade below minGrade", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agentId: "agent-low",
        passportGrade: 0,
        flags: [],
        reputationScore: 0.1,
      }),
    });

    const provider = new APSProvider({ minGrade: 1 });
    const result = await provider.verify("agent-low");

    expect(result.verified).toBe(false);
    expect(result.trustLevel).toBe(0);
    expect(result.credentials).toHaveLength(0);
  });

  it("returns verified=false when agent not found (404)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const provider = new APSProvider();
    const result = await provider.verify("unknown-agent");

    expect(result.verified).toBe(false);
    expect(result.error).toContain("404");
  });

  it("handles network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const provider = new APSProvider();
    const result = await provider.verify("agent-abc");

    expect(result.verified).toBe(false);
    expect(result.error).toContain("Network timeout");
  });

  it("uses custom gateway URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ passportGrade: 1, flags: [] }),
    });

    const provider = new APSProvider({ gatewayUrl: "https://custom.gw" });
    await provider.verify("agent-xyz");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://custom.gw/api/v1/public/trust/agent-xyz",
      expect.any(Object)
    );
  });

  it("includes JWKS URL in metadata", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ passportGrade: 2, flags: ["issuer_bound"] }),
    });

    const provider = new APSProvider();
    const result = await provider.verify("agent-abc");

    expect(result.metadata?.jwksUrl).toBe(
      "https://gateway.aeoess.com/.well-known/jwks.json"
    );
  });

  it("checkCredentials filters by type", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        passportGrade: 2,
        flags: ["issuer_bound", "runtime_bound", "delegation_valid"],
        lastActiveAt: "2026-04-01",
      }),
    });

    const provider = new APSProvider();
    const creds = await provider.checkCredentials("agent-abc", "runtime_bound");

    expect(creds).toHaveLength(1);
    expect(creds[0].type).toBe("runtime_bound");
  });

  it("checkCredentials returns all when no type filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        passportGrade: 1,
        flags: ["issuer_bound", "runtime_bound"],
        lastActiveAt: "2026-04-01",
      }),
    });

    const provider = new APSProvider();
    const creds = await provider.checkCredentials("agent-abc");

    expect(creds).toHaveLength(2);
  });

  it("defaults minGrade to 1", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ passportGrade: 0, flags: [] }),
    });

    const provider = new APSProvider(); // no config
    const result = await provider.verify("agent-zero");

    expect(result.verified).toBe(false); // grade 0 < default minGrade 1
  });
});
