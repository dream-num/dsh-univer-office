export class UniverfileSQLiteError extends Error {
  public constructor(
    public readonly code:
      | "FILE_NOT_FOUND"
      | "FILE_EXISTS"
      | "UPGRADE_LOCK_TIMEOUT"
      | "UNSUPPORTED_SCHEMA"
      | "BACKUP_FAILED"
      | "UPGRADE_FAILED"
      | "VERIFICATION_FAILED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "UniverfileSQLiteError";
  }
}
