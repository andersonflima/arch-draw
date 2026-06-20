import { Injectable, Signal, signal } from "@angular/core";

export type CanvasPan = Readonly<{ x: number; y: number }>;

const DEFAULT_ZOOM = 1;
const DEFAULT_PAN: CanvasPan = { x: 0, y: 0 };

// Owns the canvas camera (zoom + pan) as signals, extracted from the root editor
// component. The values stay plain writable signals so the component's existing
// assignment sites keep working behind thin accessors.
@Injectable({ providedIn: "root" })
export class CameraStore {
  private readonly zoomSignal = signal<number>(DEFAULT_ZOOM);
  private readonly panSignal = signal<CanvasPan>(DEFAULT_PAN);

  readonly zoom: Signal<number> = this.zoomSignal.asReadonly();
  readonly pan: Signal<CanvasPan> = this.panSignal.asReadonly();

  setZoom(zoom: number): void {
    this.zoomSignal.set(zoom);
  }

  setPan(pan: CanvasPan): void {
    this.panSignal.set(pan);
  }
}
