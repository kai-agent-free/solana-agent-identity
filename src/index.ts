import { z } from "zod";
import type { Plugin, Action } from "solana-agent-kit";
import type {
  IdentityProvider,
  VerifyResult,
  CredentialCheckResult,
} from "./types";

export type { IdentityProvider, VerifyResult, CredentialCheckResult } from "./types";
export type { Credential } from "./types";
export { createAgentPassProvider } from "./providers/agentpass";
export { createAgentIDProvider } from "./providers/agentid";

/**
 * Unified Agent Identity Plugin for Solana Agent Kit.
 * Queries multiple identity providers and returns the best result.
 */
export function createIdentityPlugin(
  providers: IdentityProvider[]
): ReturnType<typeof buildPlugin> {
  return buildPlugin(providers);
}

function buildPlugin(providers: IdentityProvider[]) {
  /** Verify across all providers, return first success */
  async function verifyAgent(
    _agent: any,
    input: { identifier: string; provider?: string; checkOnchain?: boolean }
  ): Promise<VerifyResult> {
    const targets = input.provider
      ? providers.filter((p) => p.name === input.provider)
      : providers;

    if (targets.length === 0) {
      return { verified: false, provider: null, error: "No matching provider" };
    }

    // Query all providers in parallel
    const results = await Promise.allSettled(
      targets.map((p) =>
        p.verify(input.identifier, { checkOnchain: input.checkOnchain })
      )
    );

    // Return first verified result, or best error
    let bestError: VerifyResult | null = null;
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.verified) return r.value;
      if (r.status === "fulfilled" && !bestError) bestError = r.value;
    }

    return bestError || { verified: false, provider: null, error: "All providers failed" };
  }

  /** Check credentials across all providers */
  async function checkCredentials(
    _agent: any,
    input: { identifier: string; type?: string; provider?: string }
  ): Promise<CredentialCheckResult> {
    const targets = input.provider
      ? providers.filter((p) => p.name === input.provider)
      : providers;

    const results = await Promise.allSettled(
      targets.map((p) =>
        p.checkCredentials(input.identifier, { type: input.type })
      )
    );

    const allCreds = results
      .filter((r): r is PromiseFulfilledResult<CredentialCheckResult> => r.status === "fulfilled")
      .flatMap((r) => r.value.credentials);

    return { hasCredentials: allCreds.length > 0, credentials: allCreds };
  }

  /** Resolve wallet to identity across providers */
  async function resolveWallet(
    _agent: any,
    input: { walletAddress: string }
  ): Promise<{ resolved: boolean; provider?: string; identifier?: string }> {
    for (const p of providers) {
      if (!p.resolveWallet) continue;
      const id = await p.resolveWallet(input.walletAddress).catch(() => null);
      if (id) return { resolved: true, provider: p.name, identifier: id };
    }
    return { resolved: false };
  }

  const verifyAction: Action = {
    name: "VERIFY_AGENT_IDENTITY",
    similes: ["verify agent", "check agent identity", "is this agent real", "who is this agent"],
    description: `Verify an AI agent's identity using multiple providers (${providers.map(p => p.name).join(", ")}). Checks passport/registration status and optionally on-chain binding.`,
    examples: [[{
      input: { identifier: "ap_a622a643aa71" },
      output: { verified: true, provider: "agentpass", name: "Kai", trustScore: 0.7 },
      explanation: "Verifies agent identity across all configured providers.",
    }]],
    schema: z.object({
      identifier: z.string().describe("Agent identifier (passport ID, wallet address, etc.)"),
      provider: z.string().optional().describe("Specific provider to query"),
      checkOnchain: z.boolean().optional().describe("Check on-chain binding (default: true)"),
    }),
    handler: verifyAgent,
  };

  const credentialAction: Action = {
    name: "CHECK_AGENT_CREDENTIAL",
    similes: ["check credential", "verify credential", "agent capabilities", "agent trust level"],
    description: `Check an agent's verifiable credentials across providers (${providers.map(p => p.name).join(", ")}).`,
    examples: [[{
      input: { identifier: "ap_a622a643aa71", type: "capability" },
      output: { hasCredentials: true, credentials: [{ type: "capability", issuer: "auditor", provider: "agentpass" }] },
      explanation: "Checks credentials across all providers.",
    }]],
    schema: z.object({
      identifier: z.string().describe("Agent identifier"),
      type: z.string().optional().describe("Filter by credential type"),
      provider: z.string().optional().describe("Specific provider to query"),
    }),
    handler: checkCredentials,
  };

  return {
    name: "agent-identity",
    methods: { verifyAgent, checkCredentials, resolveWallet },
    actions: [verifyAction, credentialAction],
    initialize() {},
  } satisfies Plugin;
}

export default createIdentityPlugin;
