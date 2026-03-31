import type {
  IdentityProvider,
  IdentityQuery,
  IdentityResult,
  CredentialQuery,
  CredentialResult,
} from "../types";

const AGENTID_API =
  process.env.AGENTID_API_URL || "https://getagentid.dev/api";

/**
 * AgentID provider — Ed25519 identity with trust levels L0-L4.
 * Stub implementation — to be completed by @haroldmalikfrimpong-ops.
 * See: https://github.com/haroldmalikfrimpong-ops/getagentid
 */
export class AgentIDProvider implements IdentityProvider {
  name = "agentid";

  async verify(query: IdentityQuery): Promise<IdentityResult> {
    const wallet = query.wallet;
    if (!wallet) {
      return { verified: false, provider: this.name, error: "wallet address required" };
    }

    try {
      // AgentID: wallet address IS the agent identity (Ed25519 → Solana address)
      const res = await fetch(`${AGENTID_API}/agents/${wallet}/trust-header`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return { verified: false, provider: this.name, error: `Not found (${res.status})` };
      }

      const data = await res.json();
      return {
        verified: true,
        provider: this.name,
        agentId: wallet,
        name: data.name,
        trustScore: this.normalizeTrustLevel(data.trust_level),
        onchain: true, // AgentID is Solana-native
        metadata: {
          trustLevel: data.trust_level,
          verificationCount: data.verification_count,
        },
      };
    } catch (err: any) {
      return { verified: false, provider: this.name, error: err.message };
    }
  }

  async checkCredential(query: CredentialQuery): Promise<CredentialResult> {
    // AgentID uses trust levels, not credentials — map trust level check
    const result = await this.verify({ wallet: query.wallet, agentId: query.agentId });
    if (!result.verified) {
      return { hasCredential: false, provider: this.name, credentials: [] };
    }

    const trustLevel = (result.metadata?.trustLevel as number) ?? 0;
    const minLevel = query.minTrustLevel ?? 0;

    return {
      hasCredential: trustLevel >= minLevel,
      provider: this.name,
      credentials: [
        {
          type: `trust_level_${trustLevel}`,
          issuer: "agentid_system",
          metadata: { trustLevel, meetsMinimum: trustLevel >= minLevel },
        },
      ],
    };
  }

  async trustScore(query: IdentityQuery): Promise<number | null> {
    const result = await this.verify(query);
    return result.trustScore ?? null;
  }

  /** Normalize AgentID trust levels (L0-L4) to 0-1 range */
  private normalizeTrustLevel(level: number | undefined): number {
    if (level === undefined || level === null) return 0;
    return Math.min(level / 4, 1);
  }
}
