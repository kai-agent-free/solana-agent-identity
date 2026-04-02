import type {
  IdentityProvider,
  IdentityResult,
  Credential,
  VerifyOptions,
} from "../types";

const DEFAULT_API = "https://www.getagentid.dev/api/v1";

export interface AgentIDConfig {
  apiUrl?: string;
  apiKey?: string;
}

interface DiscoverAgent {
  agent_id?: string;
  solana_address?: string;
  [key: string]: unknown;
}

interface VerifyResponse {
  verified?: boolean;
  name?: string;
  trust_level?: number;
  trust_level_label?: string;
  agent_id?: string;
  agent_type?: string;
  did?: string;
  solana_wallet?: { solana_address?: string };
  behaviour?: { risk_score?: number };
  scarring_score?: number;
  negative_signals?: number;
  resolved_signals?: number;
  certificate_valid?: boolean;
  capabilities?: unknown;
  supported_key_types?: unknown;
  is_online?: boolean;
  context_continuity?: { score?: number };
}

/**
 * AgentID identity provider for Solana Agent Kit.
 *
 * Verifies agents via the AgentID platform (getagentid.dev).
 * Trust levels: L1 (Registered) → L4 (Certified, $100k/day).
 * Ed25519 public key = Solana address (same key, same identity).
 *
 * See: https://github.com/haroldmalikfrimpong-ops/getagentid
 */
export function createAgentIDProvider(
  config: AgentIDConfig = {}
): IdentityProvider {
  const apiUrl = config.apiUrl || DEFAULT_API;

  async function discoverAgent(
    identifier: string
  ): Promise<DiscoverAgent | undefined> {
    const res = await fetch(
      `${apiUrl}/agents/discover?capability=&owner=&limit=100`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { agents?: DiscoverAgent[] };
    return (data.agents ?? []).find(
      (a) => a.solana_address === identifier || a.agent_id === identifier
    );
  }

  return {
    name: "agentid",

    async verify(
      identifier: string,
      _options?: VerifyOptions
    ): Promise<IdentityResult> {
      try {
        const agent = await discoverAgent(identifier);
        if (!agent) {
          return {
            verified: false,
            provider: "agentid",
            error: "Agent not found for this wallet address",
          };
        }

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

        const data = (await verifyRes.json()) as VerifyResponse;
        const trustLevel = data.trust_level ?? 1;

        return {
          verified: data.verified === true && data.certificate_valid !== false,
          provider: "agentid",
          name: data.name,
          trustLevel: trustLevel / 4, // normalize L1-L4 to 0-1
          onchainBound: !!data.solana_wallet?.solana_address,
          metadata: {
            agentId: data.agent_id,
            did: data.did,
            trustLevelRaw: trustLevel,
            trustLevelLabel: data.trust_level_label,
            riskScore: data.behaviour?.risk_score ?? 0,
            scarringScore: data.scarring_score ?? 0,
            negativeSignals: data.negative_signals ?? 0,
            resolvedSignals: data.resolved_signals ?? 0,
            certificateValid: data.certificate_valid,
            capabilities: data.capabilities,
            supportedKeyTypes: data.supported_key_types,
            isOnline: data.is_online,
            agentType: data.agent_type,
            contextContinuity: data.context_continuity?.score,
          },
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          verified: false,
          provider: "agentid",
          error: `API error: ${msg}`,
        };
      }
    },

    async checkCredentials(
      identifier: string,
      credentialType?: string
    ): Promise<Credential[]> {
      try {
        const agent = await discoverAgent(identifier);
        if (!agent) return [];

        const res = await fetch(
          `${apiUrl}/agents/credentials?agent_id=${agent.agent_id}`,
          {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (!res.ok) return [];

        const data = (await res.json()) as {
          credentials?: Array<{
            type?: string;
            issuer?: string;
            issued_at?: string;
            expires_at?: string;
          }>;
        };

        return (data.credentials ?? [])
          .filter((c) => !credentialType || c.type === credentialType)
          .map((c) => ({
            type: c.type || "unknown",
            issuer: c.issuer || "agentid",
            subject: identifier,
            anchoredOnchain: true,
            issuedAt: c.issued_at,
            expiresAt: c.expires_at,
          }));
      } catch {
        return [];
      }
    },
  };
}
