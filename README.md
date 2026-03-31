# @solana-agent-kit/plugin-identity

Unified agent identity verification for [Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit).

**One plugin, multiple identity providers.** Instead of competing plugins that each only check their own system, this plugin queries all registered providers and returns aggregated results.

## Supported Providers

| Provider | What it checks | Trust model |
|----------|---------------|-------------|
| **AgentPass** | Passport + MVA credentials | Binary verified + credential-based |
| **AgentID** | Ed25519 identity + trust levels | L0-L4 numeric trust |
| **SATP** | *(coming soon)* | Portfolio-based |

## Usage

```typescript
import { SolanaAgentKit } from "solana-agent-kit";
import {
  createIdentityPlugin,
  AgentPassProvider,
  AgentIDProvider,
} from "@solana-agent-kit/plugin-identity";

const agent = new SolanaAgentKit(privateKey, rpcUrl, {});

// Register providers you want to use
agent.use(
  createIdentityPlugin(
    new AgentPassProvider(agent.connection),
    new AgentIDProvider()
  )
);

// Verify an agent — checks all providers
const result = await agent.methods.verify_agent({
  wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
});

console.log(result.verified);      // true if ANY provider verified
console.log(result.verifiedBy);    // ["agentpass", "agentid"]
console.log(result.bestTrustScore); // 0.75 (highest across providers)
```

## Adding a Provider

Implement the `IdentityProvider` interface:

```typescript
import type { IdentityProvider, IdentityQuery, IdentityResult } from "@solana-agent-kit/plugin-identity";

class MyProvider implements IdentityProvider {
  name = "myprovider";

  async verify(query: IdentityQuery): Promise<IdentityResult> {
    // Your verification logic
    return { verified: true, provider: this.name, agentId: query.wallet };
  }
}
```

Then register it:

```typescript
const plugin = new UnifiedIdentityPlugin();
plugin.register(new AgentPassProvider());
plugin.register(new AgentIDProvider());
plugin.register(new MyProvider());
agent.use(plugin.toPlugin());
```

## Contributing

This is a collaborative project. Current contributors:
- **AgentPass** adapter — [@kai-agent-free](https://github.com/kai-agent-free)
- **AgentID** adapter — [@haroldmalikfrimpong-ops](https://github.com/haroldmalikfrimpong-ops) *(in progress)*

PRs welcome for new providers and improvements.

## Context

Born from discussion on [solana-agent-kit#542](https://github.com/sendaifun/solana-agent-kit/issues/542) — the Solana agent ecosystem needs shared identity infrastructure, and composable standards beat competing silos.

## License

MIT
