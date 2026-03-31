import type {
  IdentityProvider,
  VerifyResult,
  CredentialCheckResult,
} from "../types";

const DEFAULT_API = "https://www.getagentid.dev/api/v1";

export interface AgentIDConfig {
  apiUrl?: string;
  apiKey?: string;
}

/**
 * AgentID identity provider for Solana Agent Kit.
 *
 * Verifies agents via the AgentID platform (getagentid.dev).
 * Trust levels: L1 (Registered) → L4 (Certified, $100k/day).
 * Ed25519 public key = Solana address (same key, same identity).
 *
 * See: https://github.com/haroldmalikfrimpong-ops/getagentid
 * Docs: https://getagentid.dev/docs
 */
export function createAgentIDProvider(
  config: AgentIDConfig = {}
): IdentityProvider {
  const apiUrl = config.apiUrl || DEFAULT_API;

  return {
    name: "agentid",

    async verify(identifier, options = {}): Promise<VerifyResult> {
      try {
        // Step 1: Search for agent by Solana address via discover endpoint
        const searchRes = await fetch(
          `${apiUrl}/agents/discover?capability=&owner=&limit=100`,
          {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          }
        );

        if (!searchRes.ok) {
          return {
            verified: false,
            provider: "agentid",
            error: `Discovery failed (${searchRes.status})`,
          };
        }

        const searchData = await searchRes.json();
        const agents = searchData.agents || [];

        // Find agent by Solana address match
        const agent = agents.find(
          (a: any) =>
            a.solana_address === identifier ||
            a.agent_id === identifier
        );

        if (!agent) {
          return {
            verified: false,
            provider: "agentid",
            error: "Agent not found for this wallet address",
          };
        }

        // Step 2: Full verification via verify endpoint
        const verifyRes = await fetch(`${apiUrl}/agents/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(config.apiKey
              ? { Authorization: `Bearer ${config.apiKey}` }
              : {}),
          },
          body: JSON.stringify({ agent_id: agent.agent_id }),
          signal: AbortSignal.timeout(8000),
        });

        if (!verifyRes.ok) {
          return {
            verified: false,
            provider: "agentid",
            error: `Verification failed (${verifyRes.status})`,
          };
        }

        const data = await verifyRes.json();

        // Normalize trust level (L1-L4) to 0-1 score
        const trustLevel = data.trust_level ?? 1;
        const trustScore = trustLevel / 4;

        return {
          verified: data.verified === true,
          provider: "agentid",
          name: data.name,
          trustScore,
          onchainBound: !!data.solana_wallet?.solana_address,
          metadata: {
            agentId: data.agent_id,
            did: data.did,
            trustLevel,
            trustLevelLabel: data.trust_level_label,
            riskScore: data.behaviour?.risk_score ?? 0,
            scarringScore: data.scarring_score ?? 0,
            negativeSignals: data.negative_signals ?? 0,
            resolvedSignals: data.resolved_signals ?? 0,
            certificateValid: data.certificate_valid,
            capabilities: data.capabilities,
            supportedKeyTypes: data.supported_key_types,
            isOnline: data.is_online,
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

    async checkCredentials(
      identifier,
      filter = {}
    ): Promise<CredentialCheckResult> {
      try {
        // Search for agent first
        const searchRes = await fetch(
          `${apiUrl}/agents/discover?capability=&limit=100`,
          {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          }
        );

        if (!searchRes.ok) {
          return { hasCredentials: false, credentials: [] };
        }

        const searchData = await searchRes.json();
        const agent = (searchData.agents || []).find(
          (a: any) =>
            a.solana_address === identifier ||
            a.agent_id === identifier
        );

        if (!agent) {
          return { hasCredentials: false, credentials: [] };
        }

        // Get credentials from credentials endpoint
        const credRes = await fetch(
          `${apiUrl}/agents/credentials?agent_id=${agent.agent_id}`,
          {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          }
        );

        if (!credRes.ok) {
          return { hasCredentials: false, credentials: [] };
        }

        const credData = await credRes.json();
        const creds = (credData.credentials ?? [])
          .filter((c: any) => !filter.type || c.type === filter.type)
          .map((c: any) => ({
            type: c.type || "unknown",
            issuer: c.issuer || "agentid",
            subject: identifier,
            onchain: true, // AgentID receipts are anchored on Solana
            provider: "agentid",
            metadata: {
              issuedAt: c.issued_at,
              expiresAt: c.expires_at,
              signature: c.signature,
            },
          }));

        return { hasCredentials: creds.length > 0, credentials: creds };
      } catch {
        return { hasCredentials: false, credentials: [] };
      }
    },

    async resolveWallet(walletAddress: string): Promise<string | null> {
      // In AgentID, the Ed25519 public key IS the Solana address
      // No separate resolution needed
      return walletAddress;
    },
  };
}
