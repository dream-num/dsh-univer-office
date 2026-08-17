export const GATEWAY_DESCRIPTOR_MEDIA_TYPE = "application/vnd.univer.collab-gateway+json;v=1";
export const GATEWAY_DESCRIPTOR_CONTENT_TYPE = GATEWAY_DESCRIPTOR_MEDIA_TYPE;
export const GATEWAY_PROTOCOL_VERSION = 1;

export const GATEWAY_CAPABILITY_UNIVERFILE_CREATE = "univerfile.create";
export const GATEWAY_CAPABILITY_UNIVERFILE_READ = "univerfile.read";
export const GATEWAY_CAPABILITY_UNIVERFILE_WRITE = "univerfile.write";
export const GATEWAY_CAPABILITY_UNIVERFILE_WORKTREE = "univerfile.worktree";
export const GATEWAY_CAPABILITY_UNIVERFILE_VIEWER = "univerfile.viewer";

export const GATEWAY_CAPABILITIES = [
  GATEWAY_CAPABILITY_UNIVERFILE_READ,
  GATEWAY_CAPABILITY_UNIVERFILE_WRITE,
  GATEWAY_CAPABILITY_UNIVERFILE_WORKTREE,
  GATEWAY_CAPABILITY_UNIVERFILE_VIEWER,
] as const;

const KNOWN_GATEWAY_CAPABILITIES = [
  GATEWAY_CAPABILITY_UNIVERFILE_CREATE,
  ...GATEWAY_CAPABILITIES,
] as const;

export type GatewayCapability = (typeof KNOWN_GATEWAY_CAPABILITIES)[number];

export interface GatewayDescriptor {
  readonly protocolVersion: typeof GATEWAY_PROTOCOL_VERSION;
  readonly capabilities: readonly GatewayCapability[];
  readonly viewUrl?: string;
}

export type GatewayDescriptorValidationErrorCode =
  | "gateway-descriptor-content-type-mismatch"
  | "gateway-descriptor-unavailable"
  | "gateway-descriptor-malformed"
  | "gateway-protocol-version-unsupported"
  | "gateway-capability-missing";

export class GatewayDescriptorValidationError extends Error {
  public readonly code: GatewayDescriptorValidationErrorCode;

  public constructor(code: GatewayDescriptorValidationErrorCode, message: string) {
    super(message);
    this.name = "GatewayDescriptorValidationError";
    this.code = code;
  }
}

export function validateGatewayDescriptorResponse(input: {
  readonly contentType: string | null;
  readonly body: unknown;
  readonly requiredCapability?: GatewayCapability;
}): GatewayDescriptor {
  if (!isGatewayDescriptorContentType(input.contentType)) {
    throw new GatewayDescriptorValidationError(
      "gateway-descriptor-content-type-mismatch",
      `gateway descriptor Content-Type must be ${GATEWAY_DESCRIPTOR_MEDIA_TYPE}`,
    );
  }

  const descriptor = validateGatewayDescriptor(input.body);
  if (
    input.requiredCapability !== undefined &&
    !descriptor.capabilities.includes(input.requiredCapability)
  ) {
    throw new GatewayDescriptorValidationError(
      "gateway-capability-missing",
      `gateway descriptor is missing capability ${input.requiredCapability}`,
    );
  }
  return descriptor;
}

export function validateGatewayDescriptor(body: unknown): GatewayDescriptor {
  if (body === null || typeof body !== "object") {
    throw malformedDescriptor("gateway descriptor body must be an object");
  }
  const candidate = body as {
    readonly protocolVersion?: unknown;
    readonly capabilities?: unknown;
    readonly viewUrl?: unknown;
  };

  if (candidate.protocolVersion !== GATEWAY_PROTOCOL_VERSION) {
    throw new GatewayDescriptorValidationError(
      "gateway-protocol-version-unsupported",
      `unsupported gateway protocol version: ${String(candidate.protocolVersion)}`,
    );
  }

  if (!Array.isArray(candidate.capabilities)) {
    throw malformedDescriptor("gateway descriptor capabilities must be an array");
  }

  const capabilities: GatewayCapability[] = [];
  for (const capability of candidate.capabilities) {
    if (!isGatewayCapability(capability)) {
      throw malformedDescriptor("gateway descriptor capabilities must contain known strings");
    }
    capabilities.push(capability);
  }

  const hasViewer = capabilities.includes(GATEWAY_CAPABILITY_UNIVERFILE_VIEWER);
  if (hasViewer) {
    if (typeof candidate.viewUrl !== "string" || candidate.viewUrl.length === 0) {
      throw malformedDescriptor("gateway descriptor viewer capability requires viewUrl");
    }
    validateGatewayDescriptorViewUrl(candidate.viewUrl);
    return {
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      capabilities,
      viewUrl: candidate.viewUrl,
    };
  }

  if (candidate.viewUrl !== undefined) {
    throw malformedDescriptor("gateway descriptor viewUrl requires viewer capability");
  }

  return { protocolVersion: GATEWAY_PROTOCOL_VERSION, capabilities };
}

export async function fetchGatewayDescriptor(input: {
  readonly endpoint: string;
  readonly fetch?: typeof fetch;
  readonly requiredCapability?: GatewayCapability;
}): Promise<GatewayDescriptor> {
  const fetchFn = input.fetch ?? globalThis.fetch.bind(globalThis);
  const res = await fetchFn(input.endpoint, {
    headers: { accept: GATEWAY_DESCRIPTOR_MEDIA_TYPE },
  });
  if (!res.ok) {
    throw new GatewayDescriptorValidationError(
      "gateway-descriptor-unavailable",
      `gateway descriptor request failed: ${res.status} ${res.statusText}`,
    );
  }
  const contentType = res.headers.get("content-type");
  if (!isGatewayDescriptorContentType(contentType)) {
    throw new GatewayDescriptorValidationError(
      "gateway-descriptor-content-type-mismatch",
      `gateway descriptor Content-Type must be ${GATEWAY_DESCRIPTOR_MEDIA_TYPE}`,
    );
  }
  return validateGatewayDescriptorResponse({
    contentType,
    body: await res.json(),
    ...(input.requiredCapability === undefined
      ? {}
      : { requiredCapability: input.requiredCapability }),
  });
}

export function isGatewayDescriptorContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  const [mediaType, ...params] = contentType.split(";").map((part) => part.trim().toLowerCase());
  return (
    mediaType === "application/vnd.univer.collab-gateway+json" &&
    params.some((param) => param === "v=1")
  );
}

export function isGatewayCapability(value: unknown): value is GatewayCapability {
  return (
    typeof value === "string" && KNOWN_GATEWAY_CAPABILITIES.includes(value as GatewayCapability)
  );
}

export function resolveGatewayDescriptorViewUrl(input: {
  readonly endpoint: string;
  readonly descriptor: GatewayDescriptor;
}): string | undefined {
  if (input.descriptor.viewUrl === undefined) {
    return undefined;
  }
  return new URL(input.descriptor.viewUrl, input.endpoint).href;
}

function malformedDescriptor(message: string): GatewayDescriptorValidationError {
  return new GatewayDescriptorValidationError("gateway-descriptor-malformed", message);
}

function validateGatewayDescriptorViewUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value, "http://gateway.example/uf/file");
  } catch {
    throw malformedDescriptor("gateway descriptor viewUrl must be a URL reference");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw malformedDescriptor("gateway descriptor viewUrl must resolve to http(s)");
  }
}
