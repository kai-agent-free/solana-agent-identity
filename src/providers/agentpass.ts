import type {
  IdentityProvider,
  VerifyResult,
  CredentialCheckResult,
} from "../types";
import { PublicKey } from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";

const DEFAULT_API = "https://api.agentpass.space";
const PROGRAM_ID = new PublicKey(
  "7HuhmDEqdMn39DqzCFyxmjMQPbJvdtrDGLZm9bxgUzBw"
);

export interface AgentPassConfig {
  apiUrl?: string;
  connection?: Connection;
}

export function createAgentPassProvider(
  config: AgentPassConfig = {}
): IdentityProvider {
  const apiUrl = config.apiUrl || DEFAULT_API;

  return {
    name: "agentpass",

    async verify(identifier, options = {}): Promise<VerifyResult> {
      try {
        const res = await fetch(`${apiUrl}/v1/passports/${identifier}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return {
            verified: false,
            provider: "agentpass",
            error: `Passport not found (${res.status})`,
          };
        }
        const data = await res.json();
        const passport = data.passport ?? data;

        if (passport.status && passport.status !== "active") {
          return {
            verified: false,
            provider: "agentpass",
            error: `Passport status: ${passport.status}`,
          };
        }

        const result: VerifyResult = {
          verified: true,
          provider: "agentpass",
          name: passport.name,
          email: passport.email,
          trustScore: 0.5, // Base trust for verified passport
        };

        // Check on-chain binding if requested and connection available
        if (options.checkOnchain !== false && config.connection) {
          try {
            const [pda] = PublicKey.findProgramAddressSync(
              [Buffer.from("passport"), Buffer.from(identifier)],
              PROGRAM_ID
            );
            const account = await config.connection.getAccountInfo(pda);
            result.onchainBound = account !== null;
            if (account) result.trustScore = 0.7; // Higher trust if on-chain
          } catch {
            result.onchainBound = false;
          }
        }

        return result;
      } catch (err: any) {
        return {
          verified: false,
          provider: "agentpass",
          error: `API error: ${err.message}`,
        };
      }
    },

    async checkCredentials(identifier, filter = {}): Promise<CredentialCheckResult> {
      try {
        const url = new URL(`${apiUrl}/v1/passports/${identifier}/credentials`);
        if (filter.type) url.searchParams.set("type", filter.type);

        const res = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          return { hasCredentials: false, credentials: [] };
        }

        const data = await res.json();
        const creds = (data.credentials ?? data ?? []).map((c: any) => ({
          type: c.type || c.credential_type || "unknown",
          issuer: c.issuer || "unknown",
          subject: identifier,
          onchain: false, // TODO: check PDA
          provider: "agentpass",
          metadata: c,
        }));

        return { hasCredentials: creds.length > 0, credentials: creds };
      } catch {
        return { hasCredentials: false, credentials: [] };
      }
    },

    async resolveWallet(walletAddress: string): Promise<string | null> {
      // TODO: reverse lookup from on-chain PDA
      return null;
    },
  };
}
