import { Injectable, Signal, signal } from "@angular/core";
import type {
  ConnectionDragState,
  DragState,
  MarqueeState,
  PanState,
  ResizeState
} from "./interaction-types";

// Owns the transient pointer-gesture state of the canvas (node drag, pan, resize,
// marquee selection and connection drag), extracted from the root editor
// component. Each gesture is at most one-at-a-time and cleared when it ends; the
// values stay plain writable signals so the component's existing assignment sites
// keep working behind thin accessors.
@Injectable({ providedIn: "root" })
export class InteractionStore {
  private readonly dragStateSignal = signal<DragState | null>(null);
  private readonly panStateSignal = signal<PanState | null>(null);
  private readonly resizeStateSignal = signal<ResizeState | null>(null);
  private readonly marqueeStateSignal = signal<MarqueeState | null>(null);
  private readonly connectionDragStateSignal = signal<ConnectionDragState | null>(null);
  private readonly resizeEnabledNodeIdSignal = signal<string | null>(null);

  readonly dragState: Signal<DragState | null> = this.dragStateSignal.asReadonly();
  readonly panState: Signal<PanState | null> = this.panStateSignal.asReadonly();
  readonly resizeState: Signal<ResizeState | null> = this.resizeStateSignal.asReadonly();
  readonly marqueeState: Signal<MarqueeState | null> = this.marqueeStateSignal.asReadonly();
  readonly connectionDragState: Signal<ConnectionDragState | null> = this.connectionDragStateSignal.asReadonly();
  readonly resizeEnabledNodeId: Signal<string | null> = this.resizeEnabledNodeIdSignal.asReadonly();

  setDragState(state: DragState | null): void {
    this.dragStateSignal.set(state);
  }

  setPanState(state: PanState | null): void {
    this.panStateSignal.set(state);
  }

  setResizeState(state: ResizeState | null): void {
    this.resizeStateSignal.set(state);
  }

  setMarqueeState(state: MarqueeState | null): void {
    this.marqueeStateSignal.set(state);
  }

  setConnectionDragState(state: ConnectionDragState | null): void {
    this.connectionDragStateSignal.set(state);
  }

  setResizeEnabledNodeId(nodeId: string | null): void {
    this.resizeEnabledNodeIdSignal.set(nodeId);
  }
}
