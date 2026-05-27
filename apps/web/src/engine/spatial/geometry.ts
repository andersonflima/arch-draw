export type SpatialPoint = Readonly<{
  x: number;
  y: number;
}>;

export type SpatialRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export const rectsIntersect = (left: SpatialRect, right: SpatialRect): boolean =>
  left.x < right.x + right.width
  && left.x + left.width > right.x
  && left.y < right.y + right.height
  && left.y + left.height > right.y;

export const rectContainsPoint = (rect: SpatialRect, point: SpatialPoint): boolean =>
  point.x >= rect.x
  && point.x <= rect.x + rect.width
  && point.y >= rect.y
  && point.y <= rect.y + rect.height;

export const expandRect = (rect: SpatialRect, margin: number): SpatialRect => ({
  x: rect.x - margin,
  y: rect.y - margin,
  width: rect.width + margin * 2,
  height: rect.height + margin * 2
});
