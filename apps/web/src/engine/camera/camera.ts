import type { SpatialPoint, SpatialRect } from "../spatial/geometry";

export type CameraState = Readonly<{
  zoom: number;
  pan: SpatialPoint;
}>;

export type ViewportSize = Readonly<{
  width: number;
  height: number;
}>;

export const screenToWorld = (
  camera: CameraState,
  viewportOffset: SpatialPoint,
  screenPoint: SpatialPoint
): SpatialPoint => ({
  x: (screenPoint.x - viewportOffset.x - camera.pan.x) / camera.zoom,
  y: (screenPoint.y - viewportOffset.y - camera.pan.y) / camera.zoom
});

export const getVisibleWorldRect = (
  camera: CameraState,
  viewport: ViewportSize,
  minViewport: ViewportSize
): SpatialRect => ({
  x: -camera.pan.x / camera.zoom,
  y: -camera.pan.y / camera.zoom,
  width: Math.max(minViewport.width, viewport.width / camera.zoom),
  height: Math.max(minViewport.height, viewport.height / camera.zoom)
});

export const zoomCameraAtScreenPoint = (
  camera: CameraState,
  nextZoom: number,
  viewportOffset: SpatialPoint,
  screenPoint: SpatialPoint
): CameraState => {
  if (nextZoom === camera.zoom) return camera;
  const worldPoint = screenToWorld(camera, viewportOffset, screenPoint);
  return {
    zoom: nextZoom,
    pan: {
      x: screenPoint.x - viewportOffset.x - worldPoint.x * nextZoom,
      y: screenPoint.y - viewportOffset.y - worldPoint.y * nextZoom
    }
  };
};
