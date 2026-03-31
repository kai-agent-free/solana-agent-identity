/**
 * W3C Verifiable Credentials v2.0 conversion utilities.
 *
 * Converts IdentityResult + Credential objects into standard W3C VC format,
 * compatible with AGNTCY Identity Service Agent Badges and other VC verifiers.
 *
 * @see https://www.w3.org/TR/vc-data-model-2.0/
 * @see https://github.com/kai-agent-free/mva-credential/blob/main/spec/w3c-vc-mapping.md
 */

import type { IdentityResult, Credential } from "./types";

// ── W3C VC v2 types ────────────────────────────────────────────

export interface W3CVerifiableCredential {
  "@context": string[];
  type: string[];
  id?: string;
  issuer: string;
  validFrom: string;
  validUntil?: string;
  credentialSubject: Record<string, unknown>;
  credentialSchema?: CredentialSchema;
  proof?: DataIntegrityProof;
}

export interface CredentialSchema {
  id: string;
  type: string;
}

export interface DataIntegrityProof {
  type: "DataIntegrityProof";
  cryptosuite: string;
  proofPurpose: string;
  verificationMethod: string;
  proofValue: string;
}

export interface ToVCOptions {
  /** Issuer DID (e.g. "did:key:z6Mk..."). Falls back to provider name. */
  issuerDid?: string;
  /** Subject DID (e.g. "did:agentpass:ap_..."). Falls back to identifier. */
  subjectDid?: string;
  /** Credential ID URI */
  credentialId?: string;
  /** Validity duration in seconds (default: 90 days) */
  validForSeconds?: number;
  /** Proof to attach (caller signs externally) */
  proof?: DataIntegrityProof;
}

// ── Context URIs ───────────────────────────────────────────────

const W3C_VC_CONTEXT = "https://www.w3.org/ns/credentials/v2";
const AGENT_IDENTITY_CONTEXT =
  "https://agentpass.space/ns/agent-identity/v1";

// ── Conversion functions ───────────────────────────────────────

/**
 * Convert an IdentityResult into a W3C Verifiable Credential.
 *
 * This produces an unsigned VC envelope. The caller can attach a proof
 * via `options.proof` or sign it externally after creation.
 */
export function identityResultToVC(
  result: IdentityResult,
  identifier: string,
  options: ToVCOptions = {}
): W3CVerifiableCredential {
  const now = new Date();
  const validForMs = (options.validForSeconds ?? 90 * 86400) * 1000;

  const vc: W3CVerifiableCredential = {
    "@context": [W3C_VC_CONTEXT, AGENT_IDENTITY_CONTEXT],
    type: ["VerifiableCredential", "AgentIdentityCredential"],
    issuer: options.issuerDid ?? `did:agent-identity:${result.provider}`,
    validFrom: now.toISOString(),
    validUntil: new Date(now.getTime() + validForMs).toISOString(),
    credentialSubject: {
      id: options.subjectDid ?? identifier,
      type: "AgentIdentity",
      provider: result.provider,
      verified: result.verified,
      ...(result.name && { name: result.name }),
      ...(result.email && { email: result.email }),
      ...(result.onchainBound != null && {
        onchainBound: result.onchainBound,
      }),
      ...(result.trustLevel != null && { trustLevel: result.trustLevel }),
      ...(result.reputation && { reputation: result.reputation }),
      ...(result.credentials?.length && {
        credentials: result.credentials.map(credentialToClaim),
      }),
    },
  };

  if (options.credentialId) {
    vc.id = options.credentialId;
  }

  if (options.proof) {
    vc.proof = options.proof;
  }

  return vc;
}

/**
 * Convert an MVA-style Credential into a W3C VC credentialSubject claim.
 */
function credentialToClaim(
  cred: Credential
): Record<string, unknown> {
  return {
    type: cred.type,
    issuer: cred.issuer,
    subject: cred.subject,
    ...(cred.anchoredOnchain != null && {
      anchoredOnchain: cred.anchoredOnchain,
    }),
    ...(cred.issuedAt && { issuedAt: cred.issuedAt }),
    ...(cred.expiresAt && { expiresAt: cred.expiresAt }),
  };
}

/**
 * Create a minimal W3C VC from a single Credential (e.g. MVA Credential).
 */
export function credentialToVC(
  credential: Credential,
  options: ToVCOptions = {}
): W3CVerifiableCredential {
  const now = new Date();
  const validForMs = (options.validForSeconds ?? 90 * 86400) * 1000;

  const vc: W3CVerifiableCredential = {
    "@context": [W3C_VC_CONTEXT, AGENT_IDENTITY_CONTEXT],
    type: ["VerifiableCredential", "MVACredential"],
    issuer: options.issuerDid ?? `did:agent-identity:${credential.issuer}`,
    validFrom: credential.issuedAt ?? now.toISOString(),
    credentialSubject: {
      id: options.subjectDid ?? credential.subject,
      type: credential.type,
      issuer: credential.issuer,
      ...(credential.anchoredOnchain != null && {
        anchoredOnchain: credential.anchoredOnchain,
      }),
    },
  };

  if (credential.expiresAt) {
    vc.validUntil = credential.expiresAt;
  } else {
    vc.validUntil = new Date(now.getTime() + validForMs).toISOString();
  }

  if (options.credentialId) {
    vc.id = options.credentialId;
  }
  if (options.proof) {
    vc.proof = options.proof;
  }

  return vc;
}
