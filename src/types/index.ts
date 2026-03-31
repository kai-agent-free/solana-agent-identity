import type { PublicKey } from "@solana/web3.js";

/**
 * Unified identity verification result.
 * Each provider contributes its own signals; the plugin aggregates them.
 */
export interface IdentityResult {
  /** Whether the agent's identity could be verified */
  verified: boolean;
  /** Provider that produced this result */
  provider: string;
  /** Agent name or display name */
  name?: string;
  /** Agent's email if available */
  email?: string;
  /** Whether the identity is bound to a Solana wallet on-chain */
  onchainBound?: boolean;
  /** Trust level or score (provider-specific) */
  trustLevel?: number | string;
  /** Verifiable credentials the agent holds */
  credentials?: Credential[];
  /** Behavioral/reputation data */
  reputation?: ReputationData;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
  /** Error message if verification failed */
  error?: string;
}

export interface Credential {
  type: string;
  issuer: string;
  subject: string;
  anchoredOnchain?: boolean;
  issuedAt?: string;
  expiresAt?: string;
}

export interface ReputationData {
  /** Overall reputation score (0-100) */
  score?: number;
  /** Number of completed interactions */
  interactions?: number;
  /** Success rate (0-1) */
  successRate?: number;
  /** Additional reputation signals */
  signals?: Record<string, unknown>;
}

/**
 * Interface that all identity providers must implement.
 * AgentPass, AgentID, SATP, and future providers all conform to this.
 */
export interface IdentityProvider {
  /** Unique provider name (e.g., "agentpass", "agentid", "satp") */
  readonly name: string;

  /**
   * Verify an agent's identity.
   * @param identifier - Passport ID, DID, wallet address, or other identifier
   * @param options - Provider-specific options
   */
  verify(
    identifier: string,
    options?: VerifyOptions
  ): Promise<IdentityResult>;

  /**
   * Check if a wallet address is associated with a verified agent.
   * @param wallet - Solana wallet public key
   */
  verifyByWallet?(wallet: PublicKey): Promise<IdentityResult>;

  /**
   * Check credentials for an agent.
   * @param identifier - Agent identifier
   * @param credentialType - Optional filter by credential type
   */
  checkCredentials?(
    identifier: string,
    credentialType?: string
  ): Promise<Credential[]>;
}

export interface VerifyOptions {
  /** Whether to check on-chain state */
  checkOnchain?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Provider-specific options */
  [key: string]: unknown;
}

/**
 * Aggregated result from multiple providers.
 */
export interface AggregatedIdentity {
  /** Best-effort overall verification (true if ANY provider verified) */
  verified: boolean;
  /** Results from each provider */
  results: IdentityResult[];
  /** Number of providers that verified successfully */
  verifiedCount: number;
  /** Total providers queried */
  totalProviders: number;
}
