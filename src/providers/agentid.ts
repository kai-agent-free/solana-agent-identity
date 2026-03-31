import type {
  IdentityProvider,
  IdentityResult,
  VerifyOptions,
} from "../types";

const DEFAULT_API = "https://getagentid.dev";

export interface AgentIDConfig {
  apiUrl?: string;
}

/**
 * AgentID provider — Ed25519 key-based identity with trust levels L0-L4.
 * Contributed by @haroldmalikfrimpong-ops
 * https://github.com/haroldmalikfrimpong-ops/getagentid
 */
export class AgentIDProvider implements IdentityProvider {
  readonly name = "agentid";
  private apiUrl: string;

  constructor(config?: AgentIDConfig) {
    this.apiUrl = config?.apiUrl || process.env.AGENTID_API_URL || DEFAULT_API;
  }

  async verify(
    walletOrAgentId: string,
    options?: VerifyOptions
  ): Promise<IdentityResult> {
    try {
      // AgentID: wallet address IS the agent identity (Ed25519 → Solana address)
      const res = await fetch(
        `${this.apiUrl}/api/agents/${walletOrAgentId}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(options?.timeoutMs || 5000),
        }
      );

      if (!res.ok) {
        return {
          verified: false,
          provider: this.name,
          error: `Agent not found (${res.status})`,
        };
      }

      const agent = await res.json();

      // Trust header for trust level data
      let trustLevel: string | undefined;
      try {
        const trustRes = await fetch(
          `${this.apiUrl}/api/agents/${walletOrAgentId}/trust-header`,
          {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(3000),
          }
        );
        if (trustRes.ok) {
          const trust = await trustRes.json();
          trustLevel = trust.level || trust.trust_level;
        }
      } catch {
        // Trust header optional
      }

      return {
        verified: true,
        provider: this.name,
        name: agent.name || agent.display_name,
        trustLevel,
        onchainBound: true, // AgentID: key IS the wallet
        metadata: {
          agentId: agent.id,
          publicKey: agent.public_key,
          registeredAt: agent.created_at,
        },
      };
    } catch (err: any) {
      return {
        verified: false,
        provider: this.name,
        error: `API error: ${err.message}`,
      };
    }
  }
}
