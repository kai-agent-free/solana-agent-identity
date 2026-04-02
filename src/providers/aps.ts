import type {
  IdentityProvider,
  IdentityResult,
  Credential,
  VerifyOptions,
  ReputationData,
} from "../types";

const DEFAULT_GATEWAY = "https://gateway.aeoess.com";

export interface APSConfig {
  /** APS gateway URL (default: gateway.aeoess.com) */
  gatewayUrl?: string;
  /** Minimum passport grade to consider verified (default: 1) */
  minGrade?: number;
}

/**
 * Agent Passport System (APS) identity provider.
 *
 * Queries the APS public gateway for cryptographic trust profiles:
 * - Passport grade (0-3) based on attestation evidence depth
 * - Attestation flags (issuer_bound, runtime_bound, etc.)
 * - Reputation score (Bayesian, confidence-weighted)
 * - Delegation chain depth
 *
 * Public endpoints — no API key required:
 * - GET /api/v1/public/trust/:agentId → trust profile
 * - GET /.well-known/jwks.json → JWKS for signature verification
 *
 * npm: agent-passport-system | Docs: https://aeoess.com/llms-full.txt
 *
 * @example
 * ```typescript
 * const aps = new APSProvider({ minGrade: 2 });
 * const result = await aps.verify("agent-abc123");
 * console.log(result.trustLevel); // 2
 * console.log(result.credentials); // [{type: "runtime_bound", ...}]
 * ```
 */
export class APSProvider implements IdentityProvider {
  readonly name = "aps";
  private gatewayUrl: string;
  private minGrade: number;

  constructor(config?: APSConfig) {
    this.gatewayUrl =
      config?.gatewayUrl || process.env.APS_GATEWAY_URL || DEFAULT_GATEWAY;
    this.minGrade = config?.minGrade ?? 1;
  }

  async verify(
    identifier: string,
    options?: VerifyOptions
  ): Promise<IdentityResult> {
    try {
      const res = await fetch(
        `${this.gatewayUrl}/api/v1/public/trust/${encodeURIComponent(identifier)}`,
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

      const profile = (await res.json()) as any;
      const grade: number = profile.passportGrade ?? 0;
      const flags: string[] = profile.flags ?? [];
      const verified = grade >= this.minGrade;

      // Map attestation flags to credentials
      const credentials: Credential[] = flags.map((flag: string) => ({
        type: flag,
        issuer: this.gatewayUrl,
        subject: identifier,
        issuedAt: profile.lastActiveAt,
      }));

      const reputation: ReputationData = {
        score: profile.reputationScore,
        signals: {
          passportGrade: grade,
          attestationBundleHash: profile.attestationBundleHash,
          delegationDepth: profile.delegationDepth,
          flags,
        },
      };

      return {
        verified,
        provider: this.name,
        name: profile.agentId ?? identifier,
        trustLevel: grade,
        credentials,
        reputation,
        metadata: {
          gatewayUrl: this.gatewayUrl,
          jwksUrl: `${this.gatewayUrl}/.well-known/jwks.json`,
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

  async checkCredentials(
    identifier: string,
    credentialType?: string
  ): Promise<Credential[]> {
    const result = await this.verify(identifier);
    if (!result.credentials) return [];
    if (!credentialType) return result.credentials;
    return result.credentials.filter((c) => c.type === credentialType);
  }
}
