import { Injectable, Signal, signal } from "@angular/core";

// Owns the inline label-editing state for the canvas, extracted from the root
// editor component. At most one node or edge label is edited at a time; each
// target keeps its own draft text that the inline inputs bind to. The values are
// plain writable signals so the component's existing assignment sites are kept
// intact behind thin accessors.
@Injectable({ providedIn: "root" })
export class EditingStore {
  private readonly nodeIdSignal = signal<string | null>(null);
  private readonly nodeLabelDraftSignal = signal<string>("");
  private readonly edgeIdSignal = signal<string | null>(null);
  private readonly edgeLabelDraftSignal = signal<string>("");

  readonly nodeId: Signal<string | null> = this.nodeIdSignal.asReadonly();
  readonly nodeLabelDraft: Signal<string> = this.nodeLabelDraftSignal.asReadonly();
  readonly edgeId: Signal<string | null> = this.edgeIdSignal.asReadonly();
  readonly edgeLabelDraft: Signal<string> = this.edgeLabelDraftSignal.asReadonly();

  setNodeId(id: string | null): void {
    this.nodeIdSignal.set(id);
  }

  setNodeLabelDraft(value: string): void {
    this.nodeLabelDraftSignal.set(value);
  }

  setEdgeId(id: string | null): void {
    this.edgeIdSignal.set(id);
  }

  setEdgeLabelDraft(value: string): void {
    this.edgeLabelDraftSignal.set(value);
  }
}
