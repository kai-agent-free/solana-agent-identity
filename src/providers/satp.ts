import type { PublicKey } from "@solana/web3.js";
import type {
  IdentityProvider,
  IdentityResult,
  VerifyOptions,
  Credential,
  ReputationData,
} from "../types";

const DEFAULT_API_BASE = "https://agentfolio.bot/api";
const DEFAULT_TIMEOUT_MS = 5000;

export interface SATPConfig {
  /** AgentFolio API base URL */
  apiBase?: string;
  /** Request timeout in milliseconds (default: 5000) */
  timeoutMs?: number;
  /** Minimum trust score to consider verified (default: 30) */
  minTrustScore?: number;
}

interface AgentFolioProfile {
  id: string;
  name: string;
  trust_score: number;
  attestation_count: number;
  verification_types: string[];
  behavioral_consistency?: number;
  last_active?: string;
  wallets?: { solana?: string };
  social?: { github?: string; twitter?: string };
}

/**
 * SATP (Soulbound Agent Trust Protocol) identity provider.
 *
 * Queries AgentFolio for cross-org behavioral trust data:
 * - Trust score (0-100) derived from 45 attestation types
 * - Behavioral consistency metrics
 * - Social/platform verification status
 * - Attestation history and depth
 *
 * Complements AgentPass (credentials) and AgentID (DID identity)
 * with behavioral reputation — the third signal in the trust triangle.
 *
 * @example
 * ```typescript
 * const satp = new SATPProvider({ minTrustScore: 50 });
 * const result = await satp.verify("agent-solana-address");
 * console.log(result.reputation?.score); // 87
 * console.log(result.trustLevel);        // 4 (High)
 * ```
 */
export class SATPProvider implements IdentityProvider {
  readonly name = "satp";

  private apiBase: string;
  private defaultTimeoutMs: number;
  private minTrustScore: number;

  constructor(config?: SATPConfig) {
    this.apiBase = config?.apiBase ?? DEFAULT_API_BASE;
    this.defaultTimeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.minTrustScore = config?.minTrustScore ?? 30;
  }

  /**
   * Verify an agent by identifier (Solana address, AgentFolio ID, or DID).
   * Returns behavioral trust data from SATP attestation history.
   */
  async verify(
    identifier: string,
    options?: VerifyOptions
  ): Promise<IdentityResult> {
    const timeoutMs = (options?.timeoutMs as number) ?? this.defaultTimeoutMs;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${this.apiBase}/profile/${identifier}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          verified: false,
          provider: this.name,
          error: `AgentFolio API returned ${res.status}`,
        };
      }

      const profile = await res.json() as AgentFolioProfile;
      return this.mapProfileToResult(profile);
    } catch (err: unknown) {
      const error = err as Error;
      return {
        verified: false,
        provider: this.name,
        error:
          error.name === "AbortError"
            ? "Request timed out"
            : error.message ?? "Unknown error",
      };
    }
  }

  /**
   * Verify by Solana wallet public key.
   * Uses the base58 wallet address as the AgentFolio lookup key.
   */
  async verifyByWallet(wallet: PublicKey): Promise<IdentityResult> {
    return this.verify(wallet.toBase58(), { checkOnchain: true });
  }

  /**
   * Check SATP attestation credentials for an agent.
   * Each verification type (github, twitter, solana_wallet, etc.)
   * is represented as a credential from did:web:agentfolio.bot.
   */
  async checkCredentials(
    identifier: string,
    credentialType?: string
  ): Promise<Credential[]> {
    const result = await this.verify(identifier);
    if (!result.credentials) return [];
    if (credentialType) {
      return result.credentials.filter((c) => c.type === credentialType);
    }
    return result.credentials;
  }

  private mapProfileToResult(profile: AgentFolioProfile): IdentityResult {
    const trustLevel = this.mapScoreToLevel(profile.trust_score);

    const reputation: ReputationData = {
      score: profile.trust_score,
      interactions: profile.attestation_count,
      successRate: profile.behavioral_consistency
        ? profile.behavioral_consistency / 100
        : undefined,
      signals: {
        verification_depth: profile.verification_types?.length ?? 0,
        verification_types: profile.verification_types ?? [],
        last_active: profile.last_active,
        trust_tier: this.getTrustTier(profile.trust_score),
      },
    };

    // Map each verification type to a credential
    const credentials: Credential[] = (profile.verification_types ?? []).map(
      (vt) => ({
        type: `satp:${vt}`,
        issuer: "did:web:agentfolio.bot",
        subject: profile.id,
        anchoredOnchain: vt === "solana_wallet",
      })
    );

    return {
      verified: profile.trust_score >= this.minTrustScore,
      provider: this.name,
      name: profile.name,
      onchainBound: !!profile.wallets?.solana,
      trustLevel,
      credentials,
      reputation,
      metadata: {
        agentfolio_id: profile.id,
        trust_tier: this.getTrustTier(profile.trust_score),
        social_verified: {
          github: !!profile.social?.github,
          twitter: !!profile.social?.twitter,
        },
      },
    };
  }

  /**
   * Map 0-100 trust score to normalized level (1-5).
   * Aligns with browser-use TrustProvider levels for
   * cross-framework consistency.
   */
  private mapScoreToLevel(score: number): number {
    if (score >= 90) return 5; // Excellent
    if (score >= 70) return 4; // High
    if (score >= 50) return 3; // Moderate
    if (score >= 30) return 2; // Low
    return 1; // Minimal
  }

  private getTrustTier(score: number): string {
    if (score >= 90) return "excellent";
    if (score >= 70) return "high";
    if (score >= 50) return "moderate";
    if (score >= 30) return "low";
    return "minimal";
  }
}
