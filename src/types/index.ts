/**
 * Unified identity provider interface for Solana Agent Kit.
 * Each identity system (AgentPass, AgentID, SATP, etc.) implements this.
 */
export interface IdentityProvider {
  /** Unique provider name (e.g., "agentpass", "agentid", "satp") */
  name: string;

  /** Verify an agent's identity by wallet address or provider-specific ID */
  verify(query: IdentityQuery): Promise<IdentityResult>;

  /** Check if agent has a specific credential/trust level */
  checkCredential?(query: CredentialQuery): Promise<CredentialResult>;

  /** Get the trust score for an agent (normalized 0-1) */
  trustScore?(query: IdentityQuery): Promise<number | null>;
}

export interface IdentityQuery {
  /** Solana wallet address */
  wallet?: string;
  /** Provider-specific agent ID (e.g., passport_id for AgentPass) */
  agentId?: string;
}

export interface IdentityResult {
  verified: boolean;
  provider: string;
  /** Provider-specific agent identifier */
  agentId?: string;
  /** Human-readable name */
  name?: string;
  /** Trust score normalized 0-1 (if available) */
  trustScore?: number;
  /** Whether identity is anchored on-chain */
  onchain?: boolean;
  /** Raw provider-specific data */
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface CredentialQuery {
  wallet?: string;
  agentId?: string;
  /** Credential type to check (e.g., "capability", "audit", "endorsement") */
  credentialType?: string;
  /** Minimum trust level (provider-specific) */
  minTrustLevel?: number;
}

export interface CredentialResult {
  hasCredential: boolean;
  provider: string;
  credentials: Array<{
    type: string;
    issuer: string;
    issuedAt?: string;
    onchain?: boolean;
    metadata?: Record<string, unknown>;
  }>;
  error?: string;
}

/** Aggregated result from multiple providers */
export interface AggregatedIdentity {
  /** True if ANY provider verified the agent */
  verified: boolean;
  /** Results from each provider that responded */
  results: IdentityResult[];
  /** Highest trust score across providers */
  bestTrustScore: number | null;
  /** Providers that verified this agent */
  verifiedBy: string[];
}
