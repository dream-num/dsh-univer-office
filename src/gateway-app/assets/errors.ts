export class CollabGatewayAssetScopeNotFoundError extends Error {
  public constructor() {
    super("The resource was not found");
  }
}
