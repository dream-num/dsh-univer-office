import type { WorktreeLifecycleEvent } from "../contract";

/** A live lifecycle-event connection; the connection owns wire serialization. */
export interface EventConnection {
  write(event: WorktreeLifecycleEvent): void;
}

/**
 * Per-univerfile lifecycle-event hub for events that comb can't carry (version reset, worktree
 * registry/status, unit add/remove). Two channel kinds, keyed in one map:
 *  - "" = the univerfile channel (worktree registry + trunk unit_*)
 *  - <worktreeId> = that worktree's channel (reset + that worktree's unit_*)
 */
export class EventHub {
  private readonly _channels = new Map<string, Set<EventConnection>>();

  /** Subscribe to a channel ("" = univerfile, else a worktreeId). Returns an unsubscribe fn. */
  public subscribe(channel: string, conn: EventConnection): () => void {
    let set = this._channels.get(channel);
    if (!set) {
      set = new Set();
      this._channels.set(channel, set);
    }
    set.add(conn);
    return () => {
      const s = this._channels.get(channel);
      if (s) {
        s.delete(conn);
        if (s.size === 0) {
          this._channels.delete(channel);
        }
      }
    };
  }

  /** True if any channel has a live subscriber (guards idle eviction). */
  public hasConnections(): boolean {
    for (const set of this._channels.values()) {
      if (set.size > 0) {
        return true;
      }
    }
    return false;
  }

  /** Emit an event to a channel ("" = univerfile, else the worktreeId). */
  public emit(channel: string, event: WorktreeLifecycleEvent): void {
    const set = this._channels.get(channel);
    if (!set || set.size === 0) {
      return;
    }
    for (const conn of set) {
      conn.write(event);
    }
  }
}
