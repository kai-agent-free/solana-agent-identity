import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import type {
  IdentityProvider,
  IdentityQuery,
  IdentityResult,
  CredentialQuery,
  CredentialResult,
} from "../types";

const AGENTPASS_API =
  process.env.AGENTPASS_API_URL || "https://api.agentpass.space";
const PROGRAM_ID = new PublicKey(
  "7HuhmDEqdMn39DqzCFyxmjMQPbJvdtrDGLZm9bxgUzBw"
);

export class AgentPassProvider implements IdentityProvider {
  name = "agentpass";
  private connection?: Connection;

  constructor(connection?: Connection) {
    this.connection = connection;
  }

  async verify(query: IdentityQuery): Promise<IdentityResult> {
    const passportId = query.agentId;
    if (!passportId) {
      return { verified: false, provider: this.name, error: "agentId (passport_id) required" };
    }

    try {
      const res = await fetch(`${AGENTPASS_API}/v1/passports/${passportId}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { verified: false, provider: this.name, error: `Not found (${res.status})` };
      }
      const data = await res.json();
      const passport = data.passport ?? data;

      if (passport.status && passport.status !== "active") {
        return { verified: false, provider: this.name, error: `Status: ${passport.status}` };
      }

      const result: IdentityResult = {
        verified: true,
        provider: this.name,
        agentId: passportId,
        name: passport.name,
        metadata: { email: passport.email },
      };

      // Check on-chain binding if connection available
      if (this.connection) {
        try {
          const [pda] = PublicKey.findProgramAddressSync(
            [Buffer.from("passport"), Buffer.from(passportId)],
            PROGRAM_ID
          );
          const info = await this.connection.getAccountInfo(pda);
          result.onchain = info !== null;
        } catch {
          result.onchain = false;
        }
      }

      return result;
    } catch (err: any) {
      return { verified: false, provider: this.name, error: err.message };
    }
  }

  async checkCredential(query: CredentialQuery): Promise<CredentialResult> {
    const passportId = query.agentId;
    if (!passportId) {
      return { hasCredential: false, provider: this.name, credentials: [], error: "agentId required" };
    }

    try {
      const url = new URL(`${AGENTPASS_API}/v1/passports/${passportId}/credentials`);
      if (query.credentialType) url.searchParams.set("type", query.credentialType);

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        return { hasCredential: false, provider: this.name, credentials: [] };
      }

      const data = await res.json();
      const creds = (data.credentials ?? data ?? []).map((c: any) => ({
        type: c.type || c.credential_type || "unknown",
        issuer: c.issuer || "unknown",
        issuedAt: c.issued_at,
        onchain: false, // Would need on-chain check per credential
      }));

      return { hasCredential: creds.length > 0, provider: this.name, credentials: creds };
    } catch (err: any) {
      return { hasCredential: false, provider: this.name, credentials: [], error: err.message };
    }
  }

  async trustScore(query: IdentityQuery): Promise<number | null> {
    const result = await this.verify(query);
    // AgentPass doesn't have numeric trust scores — binary verified/not
    return result.verified ? 0.5 : null;
  }
}
