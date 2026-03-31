import type { PublicKey } from "@solana/web3.js";
import type {
  IdentityProvider,
  IdentityResult,
  Credential,
  VerifyOptions,
} from "../types";
import { PublicKey as SolanaPublicKey } from "@solana/web3.js";

const DEFAULT_API = "https://api.agentpass.space";
const PROGRAM_ID = new SolanaPublicKey(
  "7HuhmDEqdMn39DqzCFyxmjMQPbJvdtrDGLZm9bxgUzBw"
);

export interface AgentPassConfig {
  apiUrl?: string;
  /** Solana connection for on-chain checks */
  connection?: { getAccountInfo: (key: PublicKey) => Promise<any> };
}

export class AgentPassProvider implements IdentityProvider {
  readonly name = "agentpass";
  private apiUrl: string;
  private connection?: AgentPassConfig["connection"];

  constructor(config?: AgentPassConfig) {
    this.apiUrl = config?.apiUrl || process.env.AGENTPASS_API_URL || DEFAULT_API;
    this.connection = config?.connection;
  }

  async verify(
    passportId: string,
    options?: VerifyOptions
  ): Promise<IdentityResult> {
    try {
      const res = await fetch(`${this.apiUrl}/v1/passports/${passportId}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(options?.timeoutMs || 5000),
      });

      if (!res.ok) {
        return {
          verified: false,
          provider: this.name,
          error: `Passport not found (${res.status})`,
        };
      }

      const data = await res.json();
      const passport = data.passport ?? data;

      if (passport.status && passport.status !== "active") {
        return {
          verified: false,
          provider: this.name,
          error: `Passport status: ${passport.status}`,
        };
      }

      const result: IdentityResult = {
        verified: true,
        provider: this.name,
        name: passport.name,
        email: passport.email,
        metadata: { passportId: passport.id },
      };

      // On-chain check
      if (options?.checkOnchain !== false && this.connection) {
        try {
          const [pda] = SolanaPublicKey.findProgramAddressSync(
            [Buffer.from("passport"), Buffer.from(passportId)],
            PROGRAM_ID
          );
          const account = await this.connection.getAccountInfo(pda as any);
          result.onchainBound = account !== null;
        } catch {
          result.onchainBound = false;
        }
      }

      return result;
    } catch (err: any) {
      return {
        verified: false,
        provider: this.name,
        error: `API error: ${err.message}`,
      };
    }
  }

  async checkCredentials(
    passportId: string,
    credentialType?: string
  ): Promise<Credential[]> {
    try {
      const url = new URL(
        `${this.apiUrl}/v1/passports/${passportId}/credentials`
      );
      if (credentialType) url.searchParams.set("type", credentialType);

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return [];

      const data = await res.json();
      const creds = data.credentials ?? data ?? [];

      return creds.map((c: any) => ({
        type: c.type || c.credential_type || "unknown",
        issuer: c.issuer || "unknown",
        subject: c.subject || passportId,
        anchoredOnchain: false, // TODO: check on-chain
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
      }));
    } catch {
      return [];
    }
  }
}
