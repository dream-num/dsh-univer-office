export type {
  ErrorEnvelope,
  UnitType,
  WorktreeStatus,
  UnitSummary,
  ListUnitsResponse,
  Worktree,
  CreateWorktreeRequest,
  CreateWorktreeResponse,
  ListWorktreesResponse,
  ReadyResponse,
  ReopenResponse,
  MergeResponse,
  DiscardResponse,
  CreateUniverfileResponse,
  WorktreeLifecycleEvent,
  MergeUnitStatus,
  MergeUnitPreview,
  MergePreview,
  MergePreviewResponse,
  MergePreviewUnitResponse,
  OptimizeHistoryActiveWorktreeDetails,
  OptimizeUniverfileHistory,
  OptimizeUniverfileImages,
  OptimizeUniverfileWorktrees,
  OptimizeUniverfileReport,
  OptimizeUniverfileRequest,
  OptimizeUniverfileResponse,
} from "./types.js";

export {
  GatewaySemanticErrorCode,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SHEET,
  UNIT_TYPE_SLIDE,
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  SUPPORTED_UNIT_TYPES,
  isSupportedUnitType,
} from "./types.js";

export { encodeUniverfile, decodeUniverfile } from "./univerfile.js";

export { buildRuntimeConfig } from "./runtime-config.js";
export type {
  GatewayKeyRuntimeConfigInput,
  LocalRuntimeConfigInput,
  RuntimeConfigInput,
  RuntimeConfigUrls,
} from "./runtime-config.js";

export {
  GATEWAY_DESCRIPTOR_MEDIA_TYPE,
  GATEWAY_DESCRIPTOR_CONTENT_TYPE,
  GATEWAY_PROTOCOL_VERSION,
  GATEWAY_CAPABILITY_UNIVERFILE_CREATE,
  GATEWAY_CAPABILITY_UNIVERFILE_READ,
  GATEWAY_CAPABILITY_UNIVERFILE_WRITE,
  GATEWAY_CAPABILITY_UNIVERFILE_WORKTREE,
  GATEWAY_CAPABILITY_UNIVERFILE_VIEWER,
  GATEWAY_CAPABILITIES,
  GatewayDescriptorValidationError,
  validateGatewayDescriptor,
  validateGatewayDescriptorResponse,
  fetchGatewayDescriptor,
  isGatewayDescriptorContentType,
  isGatewayCapability,
  resolveGatewayDescriptorViewUrl,
} from "./gateway-descriptor.js";
export type {
  GatewayCapability,
  GatewayDescriptor,
  GatewayDescriptorValidationErrorCode,
} from "./gateway-descriptor.js";

export { WorktreeControlClient, WorktreeServerHttpError } from "./worktree-control-client.js";
export type {
  GatewayKeyWorktreeControlClientOptions,
  LocalWorktreeControlClientOptions,
  WorktreeControlClientOptions,
} from "./worktree-control-client.js";
