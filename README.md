# solana-agent-identity

Unified agent identity verification plugin for [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit).

One plugin, multiple identity providers. Instead of competing plugins that each only check their own system, this aggregates verification across all providers.

## Providers

| Provider | Maintainer | What it checks |
|----------|-----------|----------------|
| **AgentPass** | [@kai-agent-free](https://github.com/kai-agent-free) | Passports, MVA credentials, on-chain PDA binding |
| **AgentID** | [@haroldmalikfrimpong-ops](https://github.com/haroldmalikfrimpong-ops) | Ed25519 identity, trust levels L0-L4 |
| **APS** | [@aeoess](https://github.com/aeoess) | Passport grades, attestation flags, delegation chains |
| **SATP** | [@0xbrainkid](https://github.com/0xbrainkid) | Behavioral trust, reputation scoring *(coming soon)* |

## Usage

```typescript
import { SolanaAgentKit } from "solana-agent-kit";
import {
  createIdentityPlugin,
  AgentPassProvider,
  AgentIDProvider,
  APSProvider,
} from "solana-agent-identity";

const plugin = createIdentityPlugin([
  new AgentPassProvider(),
  new AgentIDProvider(),
  new APSProvider({ minGrade: 1 }),
  // new SATPProvider(),  // coming soon
]);

const agent = new SolanaAgentKit(privateKey, rpcUrl, {});
agent.use(plugin);

// Verify across all providers
const result = await agent.methods.verify_agent({
  identifier: "ap_a622a643aa71",
});
// → { verified: true, verifiedCount: 1, totalProviders: 2, results: [...] }

// Filter to specific providers
const result2 = await agent.methods.verify_agent({
  identifier: "7xKXt...",
  providers: ["agentid"],
});
```

## Architecture

```
┌─────────────────────────────────────────┐
│         Solana Agent Kit                │
│         (VERIFY_AGENT_IDENTITY)         │
└──────────────┬──────────────────────────┘
               │
       ┌───────▼────────┐
       │ Identity Plugin │  ← one plugin
       │ (aggregator)    │
       └──┬─────┬─────┬─┘
          │     │     │
    ┌─────▼─┐ ┌▼────┐ ┌▼───┐ ┌▼────┐
    │Agent  │ │Agent│ │APS │ │SATP │  ← multiple providers
    │Pass   │ │ID   │ │    │ │     │
    └───────┘ └─────┘ └────┘ └─────┘
```

## Adding a Provider

Implement the `IdentityProvider` interface:

```typescript
import type { IdentityProvider, IdentityResult, VerifyOptions } from "solana-agent-identity";

export class MyProvider implements IdentityProvider {
  readonly name = "my-provider";

  async verify(identifier: string, options?: VerifyOptions): Promise<IdentityResult> {
    // Your verification logic
    return { verified: true, provider: this.name, name: "Agent Name" };
  }
}
```

Then pass it to `createIdentityPlugin([..., new MyProvider()])`.

## Contributing

PRs welcome! Especially:
- **SATP provider** — @0xbrainkid
- **New providers** — any identity system can plug in
- **Tests** — always needed
- **Cross-provider credential verification** — check if a credential from one system is recognized by another

## Related

- [AgentPass](https://github.com/kai-agent-free/AgentPass) — Identity layer for AI agents
- [AgentID](https://github.com/haroldmalikfrimpong-ops/getagentid) — Cryptographic identity with trust levels
- [SATP](https://agentfolio.bot) — Solana Agent Trust Protocol
- [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit) — Connect AI agents to Solana

## License

MIT
