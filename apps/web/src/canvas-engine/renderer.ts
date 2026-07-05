import type { SceneModel } from "./scene-model.js";

/** World-to-screen transform shared by every renderer in a frame. */
export interface Camera {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface ScenePoint {
  readonly x: number;
  readonly y: number;
}

export interface HitResult {
  readonly kind: "node" | "edge";
  readonly id: string;
}

/**
 * A pluggable renderer for the canvas engine. Each implementation owns its host
 * element and draws one concern (e.g. DOM nodes, or edges on a `<canvas>`), so
 * the engine can compose renderers and swap them independently.
 */
export interface Renderer {
  /** Attach the renderer to a host element. Called once. */
  mount(host: HTMLElement): void;
  /** Draw the scene for the given camera. Called once per animation frame. */
  render(scene: SceneModel, camera: Camera): void;
  /** Resolve what sits at a world-space point, or null when nothing does. */
  hitTest(worldPoint: ScenePoint): HitResult | null;
  /** Release listeners and host resources. */
  dispose(): void;
}
