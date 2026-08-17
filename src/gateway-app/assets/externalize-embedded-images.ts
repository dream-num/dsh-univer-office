import { createHash } from "node:crypto";
import { MAX_UNIVERFILE_ASSET_BYTES } from "../univerfile-sqlite";

type SupportedImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

interface EmbeddedImage {
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly extension: "png" | "jpg" | "gif" | "webp";
  readonly mediaType: SupportedImageMediaType;
  readonly source: string;
}

interface ImageReference {
  readonly source: string;
  readonly sourceKey: string;
  readonly typeKey: string;
}

export interface ExternalizeEmbeddedImagesOptions {
  readonly store: (input: {
    readonly bytes: Uint8Array;
    readonly filename: string;
    readonly mediaType: SupportedImageMediaType;
  }) => string;
  readonly onRewrite?: (image: {
    readonly byteSize: number;
    readonly digest: string;
    readonly source: string;
  }) => void;
  /** Explicit optimization fails instead of silently preserving a supported image on store errors. */
  readonly strictStore?: boolean;
}

/**
 * Best-effort local equivalent of Workspace's CLI externalizer. Only known BASE64 image field
 * pairs are rewritten; URLs, UUIDs, SVG and malformed/unsupported data URIs remain untouched.
 */
export function externalizeEmbeddedImages(
  value: unknown,
  options: ExternalizeEmbeddedImagesOptions,
): unknown {
  const imagesBySource = collectEmbeddedImages(value);
  if (imagesBySource.size === 0) return value;

  const fileIdByDigest = new Map<string, string>();
  for (const image of new Map(
    [...imagesBySource.values()].map((candidate) => [candidate.digest, candidate]),
  ).values()) {
    try {
      const fileId = options.store({
        bytes: image.bytes,
        filename: `${image.digest}.${image.extension}`,
        mediaType: image.mediaType,
      });
      fileIdByDigest.set(image.digest, fileId);
    } catch (error) {
      if (options.strictStore === true) throw error;
      // Asset hosting is an optimization. Preserve BASE64 when local storage cannot accept it.
    }
  }
  if (fileIdByDigest.size === 0) return value;

  const fileIdBySource = new Map<string, string>();
  for (const [source, image] of imagesBySource) {
    const fileId = fileIdByDigest.get(image.digest);
    if (fileId !== undefined) fileIdBySource.set(source, fileId);
  }
  return rewriteValue(value, fileIdBySource, imagesBySource, options);
}

function collectEmbeddedImages(value: unknown): ReadonlyMap<string, EmbeddedImage> {
  const images = new Map<string, EmbeddedImage>();
  visitRecords(value, (record) => {
    for (const reference of imageFieldPairs(record, "BASE64")) {
      if (images.has(reference.source)) continue;
      const image = tryParseEmbeddedImage(reference.source);
      if (image !== undefined) images.set(reference.source, image);
    }
  });
  return images;
}

function rewriteValue(
  value: unknown,
  replacementBySource: ReadonlyMap<string, string>,
  imagesBySource: ReadonlyMap<string, EmbeddedImage>,
  options: ExternalizeEmbeddedImagesOptions,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteValue(item, replacementBySource, imagesBySource, options));
  }
  if (!isPlainRecord(value)) return value;

  const rewritten: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    rewritten[key] = rewriteValue(child, replacementBySource, imagesBySource, options);
  }
  for (const reference of imageFieldPairs(value, "BASE64")) {
    const replacement = replacementBySource.get(reference.source);
    if (replacement !== undefined) {
      rewritten[reference.sourceKey] = replacement;
      rewritten[reference.typeKey] = "UUID";
      const image = imagesBySource.get(reference.source);
      if (image !== undefined) {
        options.onRewrite?.({
          byteSize: image.bytes.byteLength,
          digest: image.digest,
          source: image.source,
        });
      }
    }
  }
  return rewritten;
}

function imageFieldPairs(
  record: Readonly<Record<string, unknown>>,
  sourceType: "BASE64",
): readonly ImageReference[] {
  const pairs: ImageReference[] = [];
  addImageFieldPair(pairs, record, sourceType, "source", "imageSourceType");
  addImageFieldPair(pairs, record, sourceType, "fillImageSource", "fillImageSourceType");
  addImageFieldPair(pairs, record, sourceType, "source", "sourceType");
  return pairs;
}

function addImageFieldPair(
  pairs: ImageReference[],
  record: Readonly<Record<string, unknown>>,
  sourceType: "BASE64",
  sourceKey: string,
  typeKey: string,
): void {
  const source = record[sourceKey];
  if (record[typeKey] === sourceType && typeof source === "string" && source.length > 0) {
    pairs.push({ source, sourceKey, typeKey });
  }
}

function tryParseEmbeddedImage(source: string): EmbeddedImage | undefined {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/u.exec(source);
  if (match === null) return undefined;
  const mediaType = match[1] as SupportedImageMediaType | undefined;
  const encoded = match[2];
  if (mediaType === undefined || encoded === undefined) return undefined;
  if (encoded.length === 0 || encoded.length % 4 !== 0 || !isCanonicalBase64(encoded)) {
    return undefined;
  }
  const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
  if (bytes.byteLength > MAX_UNIVERFILE_ASSET_BYTES || !matchesImageSignature(mediaType, bytes)) {
    return undefined;
  }
  return {
    bytes,
    digest: createHash("sha256").update(bytes).digest("hex"),
    extension: imageExtension(mediaType),
    mediaType,
    source,
  };
}

function isCanonicalBase64(value: string): boolean {
  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value;
}

function matchesImageSignature(mediaType: SupportedImageMediaType, bytes: Uint8Array): boolean {
  if (mediaType === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  }
  if (mediaType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/webp") {
    return (
      Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
    );
  }
  const header = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
  return header === "GIF87a" || header === "GIF89a";
}

function imageExtension(mediaType: SupportedImageMediaType): "png" | "jpg" | "gif" | "webp" {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "gif";
}

function visitRecords(
  value: unknown,
  visit: (record: Readonly<Record<string, unknown>>) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) visitRecords(item, visit);
    return;
  }
  if (!isPlainRecord(value)) return;
  visit(value);
  for (const child of Object.values(value)) visitRecords(child, visit);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
