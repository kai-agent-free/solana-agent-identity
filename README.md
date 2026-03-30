# solana-agent-identity

Unified agent identity plugin for [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit). One plugin, multiple identity providers.

Born from the discussion in [solana-agent-kit#542](https://github.com/sendaifun/solana-agent-kit/issues/542) — the Solana agent ecosystem needs identity infrastructure, but not three competing plugins that each only check their own system. This plugin queries all providers in parallel and returns the best result.

## Supported Providers

| Provider | Status | Maintainer |
|----------|--------|------------|
| [AgentPass](https://agentpass.space) | ✅ Implemented | [@kai-agent-free](https://github.com/kai-agent-free) |
| [AgentID](https://getagentid.dev) | 🔧 Stub (awaiting adapter) | [@haroldmalikfrimpong-ops](https://github.com/haroldmalikfrimpong-ops) |
| SATP | 📋 Planned | TBD |

## Usage

```typescript
import { SolanaAgentKit } from "solana-agent-kit";
import { createIdentityPlugin, createAgentPassProvider, createAgentIDProvider } from "solana-agent-identity";

const identityPlugin = createIdentityPlugin([
  createAgentPassProvider({ connection: agent.connection }),
  createAgentIDProvider(),
]);

const agent = new SolanaAgentKit(privateKey, rpcUrl, {});
agent.use(identityPlugin);

// Verify across all providers
const result = await agent.methods.verifyAgent({ identifier: "ap_a622a643aa71" });
// → { verified: true, provider: "agentpass", name: "Kai", trustScore: 0.7 }

// Check specific provider
const agentId = await agent.methods.verifyAgent({
  identifier: "7xKX...",
  provider: "agentid",
});

// Check credentials across all providers
const creds = await agent.methods.checkCredentials({
  identifier: "ap_a622a643aa71",
  type: "capability",
});
```

## Adding a Provider

Implement the `IdentityProvider` interface:

```typescript
import type { IdentityProvider } from "solana-agent-identity";

export function createMyProvider(): IdentityProvider {
  return {
    name: "myprovider",
    
    async verify(identifier, options) {
      // Verify agent identity
      return { verified: true, provider: "myprovider", name: "Agent", trustScore: 0.5 };
    },
    
    async checkCredentials(identifier, filter) {
      // Check credentials
      return { hasCredentials: false, credentials: [] };
    },
    
    // Optional: resolve Solana wallet → provider identity
    async resolveWallet(walletAddress) {
      return null;
    },
  };
}
```

Then register it:

```typescript
const plugin = createIdentityPlugin([
  createMyProvider(),
  // ...other providers
]);
```

## Actions (for LLM agents)

| Action | Triggers | Description |
|--------|----------|-------------|
| `VERIFY_AGENT_IDENTITY` | "verify agent", "is this agent real" | Verify identity across all providers |
| `CHECK_AGENT_CREDENTIAL` | "check credential", "agent capabilities" | Check verifiable credentials |

## Design Principles

- **One plugin, many providers** — agents shouldn't need to know which identity system to query
- **Parallel verification** — all providers queried simultaneously, first success wins
- **Normalized trust scores** — each provider maps to 0-1 scale for comparable results
- **Provider-agnostic credentials** — common `Credential` type across all providers
- **Open for contribution** — implement `IdentityProvider`, submit a PR

## Links

- [Discussion: SAK#542](https://github.com/sendaifun/solana-agent-kit/issues/542)
- [AgentPass](https://github.com/kai-agent-free/AgentPass)
- [AgentID](https://github.com/haroldmalikfrimpong-ops/getagentid)
- [MVA Credential](https://github.com/kai-agent-free/mva-credential)
