import { z } from "zod";
import type { Plugin, Action, SolanaAgentKit } from "solana-agent-kit";
import type {
  IdentityProvider,
  IdentityQuery,
  AggregatedIdentity,
} from "./types";

export * from "./types";
export * from "./providers";

/**
 * Unified identity plugin for Solana Agent Kit.
 * Queries multiple identity providers (AgentPass, AgentID, SATP, etc.)
 * and returns aggregated results.
 */
export class UnifiedIdentityPlugin {
  private providers: IdentityProvider[] = [];

  /** Register an identity provider */
  register(provider: IdentityProvider): this {
    this.providers.push(provider);
    return this;
  }

  /** Verify agent across all registered providers */
  async verify(query: IdentityQuery): Promise<AggregatedIdentity> {
    const results = await Promise.allSettled(
      this.providers.map((p) => p.verify(query))
    );

    const successful = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map((r) => r.value);

    const verified = successful.filter((r) => r.verified);

    let bestScore: number | null = null;
    for (const r of successful) {
      if (r.trustScore !== undefined && r.trustScore !== null) {
        if (bestScore === null || r.trustScore > bestScore) {
          bestScore = r.trustScore;
        }
      }
    }

    return {
      verified: verified.length > 0,
      results: successful,
      bestTrustScore: bestScore,
      verifiedBy: verified.map((r) => r.provider),
    };
  }

  /** Create a Solana Agent Kit Plugin from this instance */
  toPlugin(): Plugin {
    const self = this;

    const verifyAction: Action = {
      name: "VERIFY_AGENT_IDENTITY",
      similes: [
        "verify agent",
        "check agent identity",
        "is this agent real",
        "who is this agent",
        "agent trust check",
      ],
      description:
        "Verify an AI agent's identity across multiple providers (AgentPass, AgentID, SATP). Returns aggregated verification results and trust scores.",
      examples: [
        [
          {
            input: { wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" },
            output: {
              verified: true,
              verifiedBy: ["agentpass", "agentid"],
              bestTrustScore: 0.75,
            },
            explanation:
              "Checks agent identity across all registered providers using wallet address.",
          },
        ],
      ],
      schema: z.object({
        wallet: z.string().optional().describe("Solana wallet address"),
        agentId: z.string().optional().describe("Provider-specific agent ID"),
      }),
      handler: async (_agent: SolanaAgentKit, input: Record<string, any>) => {
        return await self.verify(input as IdentityQuery) as any;
      },
    };

    return {
      name: "identity",
      methods: {
        verify_agent: (query: IdentityQuery) => self.verify(query),
      },
      actions: [verifyAction],
      initialize(): void {},
    };
  }
}

/** Create a pre-configured plugin with default providers */
export function createIdentityPlugin(
  ...providers: IdentityProvider[]
): Plugin {
  const plugin = new UnifiedIdentityPlugin();
  providers.forEach((p) => plugin.register(p));
  return plugin.toPlugin();
}
