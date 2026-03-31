import { z } from "zod";
import type { Plugin, Action, SolanaAgentKit } from "solana-agent-kit";
import type {
  IdentityProvider,
  AggregatedIdentity,
  VerifyOptions,
} from "./types";

/**
 * Unified Agent Identity Plugin for Solana Agent Kit.
 *
 * Aggregates identity verification across multiple providers
 * (AgentPass, AgentID, SATP, and any future IdentityProvider).
 */
export function createIdentityPlugin(
  providers: IdentityProvider[]
): Plugin {
  async function verifyAgent(
    _agent: SolanaAgentKit,
    input: { identifier: string; providers?: string[]; checkOnchain?: boolean }
  ): Promise<AggregatedIdentity> {
    const opts: VerifyOptions = {
      checkOnchain: input.checkOnchain ?? true,
    };

    const activeProviders = input.providers
      ? providers.filter((p) => input.providers!.includes(p.name))
      : providers;

    const results = await Promise.allSettled(
      activeProviders.map((p) => p.verify(input.identifier, opts))
    );

    const identityResults = results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : {
            verified: false,
            provider: activeProviders[i].name,
            error: r.reason?.message || "Provider failed",
          }
    );

    const verifiedCount = identityResults.filter((r) => r.verified).length;

    return {
      verified: verifiedCount > 0,
      results: identityResults,
      verifiedCount,
      totalProviders: activeProviders.length,
    };
  }

  const verifyAction: Action = {
    name: "VERIFY_AGENT_IDENTITY",
    similes: [
      "verify agent",
      "check agent identity",
      "is this agent real",
      "who is this agent",
      "agent identity check",
    ],
    description: `Verify an AI agent's identity across multiple providers (${providers
      .map((p) => p.name)
      .join(", ")}). Returns aggregated verification results.`,
    examples: [
      [
        {
          input: { identifier: "ap_a622a643aa71" },
          output: {
            verified: true,
            verifiedCount: 1,
            totalProviders: 2,
            results: [
              { verified: true, provider: "agentpass", name: "Kai" },
              { verified: false, provider: "agentid", error: "Not found" },
            ],
          },
          explanation:
            "Verifies an agent across all registered providers. AgentPass found it, AgentID did not.",
        },
      ],
    ],
    schema: z.object({
      identifier: z
        .string()
        .describe(
          "Agent identifier — passport ID, wallet address, or DID"
        ),
      providers: z
        .array(z.string())
        .optional()
        .describe("Filter to specific providers (default: all)"),
      checkOnchain: z
        .boolean()
        .optional()
        .describe("Check on-chain state (default: true)"),
    }),
    handler: async (agent, input) => verifyAgent(agent, input as any),
  };

  return {
    name: "agent-identity",
    methods: { verify_agent: verifyAgent },
    actions: [verifyAction],
    initialize: () => {},
  } satisfies Plugin;
}
