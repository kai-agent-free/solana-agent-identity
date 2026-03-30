/**
 * Unified Agent Identity types for Solana Agent Kit.
 * 
 * This plugin supports multiple identity providers (AgentPass, AgentID, SATP)
 * through a common IdentityProvider interface. One plugin, multiple backends.
 */

/** Result of verifying an agent's identity */
export interface VerifyResult {
  /** Whether the agent was verified by at least one provider */
  verified: boolean;
  /** Which provider verified the agent (null if none) */
  provider: string | null;
  /** Agent's display name */
  name?: string;
  /** Agent's email */
  email?: string;
  /** Trust level (0-1 normalized across providers) */
  trustScore?: number;
  /** Whether the identity is bound to a Solana wallet on-chain */
  onchainBound?: boolean;
  /** Raw provider-specific data */
  metadata?: Record<string, unknown>;
  /** Error message if verification failed */
  error?: string;
}

/** A verifiable credential from any provider */
export interface Credential {
  /** Credential type (e.g., "capability", "endorsement", "audit") */
  type: string;
  /** Who issued the credential */
  issuer: string;
  /** Who the credential is about */
  subject: string;
  /** Whether anchored on-chain */
  onchain: boolean;
  /** Provider that issued it */
  provider: string;
  /** Additional data */
  metadata?: Record<string, unknown>;
}

/** Result of checking credentials */
export interface CredentialCheckResult {
  /** Whether any matching credentials were found */
  hasCredentials: boolean;
  /** All matching credentials across providers */
  credentials: Credential[];
}

/**
 * Interface that all identity providers must implement.
 * AgentPass, AgentID, SATP each provide an adapter.
 */
export interface IdentityProvider {
  /** Unique provider name (e.g., "agentpass", "agentid", "satp") */
  name: string;

  /**
   * Verify an agent's identity.
   * @param identifier - Provider-specific ID (passport ID, wallet address, etc.)
   * @param options - Optional: check on-chain binding, etc.
   */
  verify(
    identifier: string,
    options?: { checkOnchain?: boolean }
  ): Promise<VerifyResult>;

  /**
   * Check credentials for an agent.
   * @param identifier - Provider-specific ID
   * @param filter - Optional credential type filter
   */
  checkCredentials(
    identifier: string,
    filter?: { type?: string }
  ): Promise<CredentialCheckResult>;

  /**
   * Resolve a Solana wallet address to a provider identity.
   * Returns null if no mapping exists.
   */
  resolveWallet?(walletAddress: string): Promise<string | null>;
}
