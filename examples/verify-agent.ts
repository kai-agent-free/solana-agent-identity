/**
 * Example: Verify an agent's identity before interacting with it.
 *
 * Usage:
 *   npx tsx examples/verify-agent.ts <agent-identifier>
 *
 * The identifier can be:
 *   - An AgentPass passport ID (e.g., "ap_a622a643aa71")
 *   - A Solana wallet address
 *   - An AgentID DID
 *   - An APS passport reference
 */

import {
  createIdentityPlugin,
  AgentPassProvider,
  createAgentIDProvider,
  APSProvider,
} from "../src";

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error("Usage: npx tsx examples/verify-agent.ts <agent-identifier>");
    process.exit(1);
  }

  // Initialize providers — each checks a different trust dimension
  const providers = [
    new AgentPassProvider(),       // Credentials & attestations
    createAgentIDProvider(),       // Cryptographic identity (Ed25519)
    new APSProvider({ minGrade: 1 }), // Governance & delegation
  ];

  const plugin = createIdentityPlugin(providers);

  // Verify across all providers
  console.log(`\nVerifying: ${identifier}\n`);

  const result = await (plugin.methods as any).verify_agent(
    {} as any,
    { identifier }
  );

  console.log(`Verified: ${result.verified}`);
  console.log(`Providers: ${result.verifiedCount}/${result.totalProviders} confirmed\n`);

  for (const r of result.results) {
    const status = r.verified ? "✅" : "❌";
    console.log(`  ${status} ${r.provider}: ${r.name || r.error || "no data"}`);
    if (r.trustLevel) console.log(`     Trust: ${r.trustLevel}`);
    if (r.credentials?.length)
      console.log(`     Credentials: ${r.credentials.length}`);
    if (r.reputation?.score != null)
      console.log(`     Reputation: ${r.reputation.score}/100`);
  }

  console.log();
}

main().catch(console.error);
