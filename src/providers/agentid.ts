import type {
  IdentityProvider,
  VerifyResult,
  CredentialCheckResult,
} from "../types";

const DEFAULT_API = "https://getagentid.dev/api";

export interface AgentIDConfig {
  apiUrl?: string;
}

/**
 * AgentID provider stub.
 * 
 * This is a placeholder for the AgentID team to implement.
 * See: https://github.com/haroldmalikfrimpong-ops/getagentid
 * 
 * AgentID uses Ed25519 keys where the public key IS a Solana address.
 * Trust levels: L0 (unverified) → L4 (full trust, $10k/day spending).
 * Verification via challenge-response.
 */
export function createAgentIDProvider(
  config: AgentIDConfig = {}
): IdentityProvider {
  const apiUrl = config.apiUrl || DEFAULT_API;

  return {
    name: "agentid",

    async verify(identifier, options = {}): Promise<VerifyResult> {
      try {
        // AgentID lookup: wallet address → agent
        const res = await fetch(`${apiUrl}/agents/${identifier}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          return {
            verified: false,
            provider: "agentid",
            error: `Agent not found (${res.status})`,
          };
        }

        const agent = await res.json();

        // Normalize trust level (L0-L4) to 0-1 score
        const trustLevel = agent.trust_level ?? agent.trustLevel ?? 0;
        const trustScore = trustLevel / 4;

        return {
          verified: true,
          provider: "agentid",
          name: agent.name || agent.agent_name,
          trustScore,
          onchainBound: true, // AgentID key IS a Solana address
          metadata: {
            trustLevel,
            agentId: agent.id || agent.agent_id,
          },
        };
      } catch (err: any) {
        return {
          verified: false,
          provider: "agentid",
          error: `API error: ${err.message}`,
        };
      }
    },

    async checkCredentials(identifier, filter = {}): Promise<CredentialCheckResult> {
      try {
        const res = await fetch(`${apiUrl}/agents/${identifier}/credentials`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          return { hasCredentials: false, credentials: [] };
        }

        const data = await res.json();
        const creds = (data.credentials ?? data ?? [])
          .filter((c: any) => !filter.type || c.type === filter.type)
          .map((c: any) => ({
            type: c.type || "unknown",
            issuer: c.issuer || "unknown",
            subject: identifier,
            onchain: !!c.onchain_receipt,
            provider: "agentid",
            metadata: c,
          }));

        return { hasCredentials: creds.length > 0, credentials: creds };
      } catch {
        return { hasCredentials: false, credentials: [] };
      }
    },

    async resolveWallet(walletAddress: string): Promise<string | null> {
      // In AgentID, the wallet IS the identity
      return walletAddress;
    },
  };
}
