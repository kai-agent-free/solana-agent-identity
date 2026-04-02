export { createIdentityPlugin } from "./plugin";
export { AgentPassProvider, createAgentIDProvider, SATPProvider, APSProvider } from "./providers";
export type { AgentPassConfig, AgentIDConfig, SATPConfig, APSConfig } from "./providers";
export { identityResultToVC, credentialToVC } from "./vc";
export type {
  W3CVerifiableCredential,
  DataIntegrityProof,
  ToVCOptions,
} from "./vc";
export type {
  IdentityProvider,
  IdentityResult,
  AggregatedIdentity,
  Credential,
  ReputationData,
  VerifyOptions,
} from "./types";
