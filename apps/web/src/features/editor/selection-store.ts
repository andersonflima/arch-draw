import { Injectable, Signal, computed, signal } from "@angular/core";

// Owns the canvas selection state as signals, extracted from the root editor
// component. `ids` is the set of selected node ids; `primaryId` is the single
// focused node (null when zero or many are selected). They are kept as separate
// writable signals to preserve the component's existing assignment semantics; a
// memoized Set powers the per-node `has()` lookup used during rendering.
@Injectable({ providedIn: "root" })
export class SelectionStore {
  private readonly idsSignal = signal<readonly string[]>([]);
  private readonly primaryIdSignal = signal<string | null>(null);
  private readonly idSetSignal = computed(() => new Set(this.idsSignal()));

  readonly ids: Signal<readonly string[]> = this.idsSignal.asReadonly();
  readonly primaryId: Signal<string | null> = this.primaryIdSignal.asReadonly();

  setIds(ids: readonly string[]): void {
    this.idsSignal.set(ids);
  }

  setPrimaryId(id: string | null): void {
    this.primaryIdSignal.set(id);
  }

  has(nodeId: string): boolean {
    return this.idSetSignal().has(nodeId);
  }
}
