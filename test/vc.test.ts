import { describe, it, expect } from "vitest";
import {
  identityResultToVC,
  credentialToVC,
  type W3CVerifiableCredential,
} from "../src/vc";
import type { IdentityResult, Credential } from "../src/types";

describe("identityResultToVC", () => {
  const baseResult: IdentityResult = {
    verified: true,
    provider: "agentpass",
    name: "Kai",
    email: "kai@agent-mail.xyz",
    trustLevel: 5,
    onchainBound: true,
  };

  it("produces valid W3C VC v2 structure", () => {
    const vc = identityResultToVC(baseResult, "ap_test123");

    expect(vc["@context"]).toContain("https://www.w3.org/ns/credentials/v2");
    expect(vc.type).toContain("VerifiableCredential");
    expect(vc.type).toContain("AgentIdentityCredential");
    expect(vc.issuer).toBe("did:agent-identity:agentpass");
    expect(vc.validFrom).toBeTruthy();
    expect(vc.validUntil).toBeTruthy();
    expect(vc.credentialSubject.id).toBe("ap_test123");
    expect(vc.credentialSubject.verified).toBe(true);
  });

  it("includes agent metadata in credentialSubject", () => {
    const vc = identityResultToVC(baseResult, "ap_test123");

    expect(vc.credentialSubject.name).toBe("Kai");
    expect(vc.credentialSubject.email).toBe("kai@agent-mail.xyz");
    expect(vc.credentialSubject.trustLevel).toBe(5);
    expect(vc.credentialSubject.onchainBound).toBe(true);
  });

  it("respects custom DIDs", () => {
    const vc = identityResultToVC(baseResult, "ap_test", {
      issuerDid: "did:key:z6MkTest",
      subjectDid: "did:agentpass:ap_test",
      credentialId: "urn:mva:sha256:abc",
    });

    expect(vc.issuer).toBe("did:key:z6MkTest");
    expect(vc.credentialSubject.id).toBe("did:agentpass:ap_test");
    expect(vc.id).toBe("urn:mva:sha256:abc");
  });

  it("attaches proof when provided", () => {
    const proof = {
      type: "DataIntegrityProof" as const,
      cryptosuite: "eddsa-jcs-2022",
      proofPurpose: "assertionMethod",
      verificationMethod: "did:key:z6Mk#key-1",
      proofValue: "z3abc...",
    };

    const vc = identityResultToVC(baseResult, "test", { proof });
    expect(vc.proof).toEqual(proof);
  });

  it("omits undefined optional fields", () => {
    const minimal: IdentityResult = {
      verified: false,
      provider: "agentid",
    };

    const vc = identityResultToVC(minimal, "test");
    expect(vc.credentialSubject).not.toHaveProperty("name");
    expect(vc.credentialSubject).not.toHaveProperty("email");
    expect(vc.credentialSubject).not.toHaveProperty("trustLevel");
    expect(vc.credentialSubject).not.toHaveProperty("onchainBound");
    expect(vc.credentialSubject).not.toHaveProperty("reputation");
    expect(vc.credentialSubject).not.toHaveProperty("credentials");
  });

  it("includes credentials as claims", () => {
    const withCreds: IdentityResult = {
      ...baseResult,
      credentials: [
        {
          type: "mva",
          issuer: "agentpass",
          subject: "kai",
          anchoredOnchain: true,
          issuedAt: "2026-03-01T00:00:00Z",
        },
      ],
    };

    const vc = identityResultToVC(withCreds, "test");
    const creds = vc.credentialSubject.credentials as any[];
    expect(creds).toHaveLength(1);
    expect(creds[0].type).toBe("mva");
    expect(creds[0].anchoredOnchain).toBe(true);
  });

  it("sets custom validity duration", () => {
    const vc = identityResultToVC(baseResult, "test", {
      validForSeconds: 3600, // 1 hour
    });

    const from = new Date(vc.validFrom).getTime();
    const until = new Date(vc.validUntil!).getTime();
    expect(until - from).toBeCloseTo(3600 * 1000, -2);
  });
});

describe("credentialToVC", () => {
  const baseCred: Credential = {
    type: "mva",
    issuer: "agentpass",
    subject: "kai",
    anchoredOnchain: true,
    issuedAt: "2026-03-01T00:00:00Z",
    expiresAt: "2026-06-01T00:00:00Z",
  };

  it("produces MVACredential type", () => {
    const vc = credentialToVC(baseCred);
    expect(vc.type).toContain("MVACredential");
    expect(vc.type).toContain("VerifiableCredential");
  });

  it("uses credential issuedAt as validFrom", () => {
    const vc = credentialToVC(baseCred);
    expect(vc.validFrom).toBe("2026-03-01T00:00:00Z");
  });

  it("uses credential expiresAt as validUntil", () => {
    const vc = credentialToVC(baseCred);
    expect(vc.validUntil).toBe("2026-06-01T00:00:00Z");
  });

  it("falls back to default validity when no expiresAt", () => {
    const noExpiry: Credential = { type: "mva", issuer: "ap", subject: "k" };
    const vc = credentialToVC(noExpiry);
    expect(vc.validUntil).toBeTruthy();
  });
});
