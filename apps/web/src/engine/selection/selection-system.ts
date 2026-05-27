import type { SpatialRect } from "../spatial/geometry";
import type { UniformGridSpatialIndex } from "../spatial/spatial-index";

export const selectIdsInRect = <T>(
  index: UniformGridSpatialIndex<T>,
  rect: SpatialRect
): readonly string[] => {
  if (rect.width < 2 && rect.height < 2) return [];
  return index.query(rect).map((entry) => entry.id);
};
