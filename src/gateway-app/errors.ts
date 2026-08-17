import type { GatewaySemanticErrorCode } from './contract';

/** Gateway-owned semantic failure that crosses the HTTP contract boundary. */
export class GatewaySemanticError extends Error {
  public readonly semanticCode: GatewaySemanticErrorCode;
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  public constructor(
    semanticCode: GatewaySemanticErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(`${semanticCode}: ${message}`);
    this.name = "GatewaySemanticError";
    this.semanticCode = semanticCode;
    this.details = details;
  }
}
