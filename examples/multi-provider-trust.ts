/**
 * Example: Multi-provider trust decision.
 *
 * Shows how to use aggregated identity results to make trust decisions:
 * - "Should I execute this agent's trade request?"
 * - "Should I share data with this agent?"
 *
 * Usage:
 *   npx tsx examples/multi-provider-trust.ts <agent-identifier>
 */

import {
  createIdentityPlugin,
  AgentPassProvider,
  createAgentIDProvider,
  APSProvider,
  type AggregatedIdentity,
} from "../src";

/** Trust policy: require at least N providers to verify */
function meetsPolicy(
  result: AggregatedIdentity,
  opts: { minProviders?: number; requiredProviders?: string[] } = {}
): { allowed: boolean; reason: string } {
  const min = opts.minProviders ?? 1;
  const required = opts.requiredProviders ?? [];

  if (result.verifiedCount < min) {
    return {
      allowed: false,
      reason: `Only ${result.verifiedCount}/${min} providers verified`,
    };
  }

  for (const name of required) {
    const r = result.results.find((r) => r.provider === name);
    if (!r?.verified) {
      return {
        allowed: false,
        reason: `Required provider "${name}" did not verify`,
      };
    }
  }

  return { allowed: true, reason: "Policy satisfied" };
}

async function main() {
  const identifier = process.argv[2] || "ap_a622a643aa71";

  const plugin = createIdentityPlugin([
    new AgentPassProvider(),
    createAgentIDProvider(),
    new APSProvider({ minGrade: 1 }),
  ]);

  const result = await (plugin.methods as any).verify_agent(
    {} as any,
    { identifier }
  );

  console.log("\n--- Trust Policy: Low (any 1 provider) ---");
  const low = meetsPolicy(result, { minProviders: 1 });
  console.log(`${low.allowed ? "✅ ALLOW" : "❌ DENY"}: ${low.reason}`);

  console.log("\n--- Trust Policy: Medium (2+ providers) ---");
  const med = meetsPolicy(result, { minProviders: 2 });
  console.log(`${med.allowed ? "✅ ALLOW" : "❌ DENY"}: ${med.reason}`);

  console.log("\n--- Trust Policy: High (AgentPass required + 2 total) ---");
  const high = meetsPolicy(result, {
    minProviders: 2,
    requiredProviders: ["agentpass"],
  });
  console.log(`${high.allowed ? "✅ ALLOW" : "❌ DENY"}: ${high.reason}`);

  console.log();
}

main().catch(console.error);
