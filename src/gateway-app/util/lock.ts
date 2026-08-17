/**
 * Per-key serial lock: runs tasks for the same key one at a time, in submission order.
 * Used to serialize applies per unit so revisions stay continuous.
 */
export class KeyedLock {
  private readonly _tails = new Map<string, Promise<unknown>>();

  public run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this._tails.get(key) ?? Promise.resolve();
    const next = prev.then(task, task);
    // Keep the chain alive but don't leak rejections into the tail.
    this._tails.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }
}
