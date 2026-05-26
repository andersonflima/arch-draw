export const toEdgeMarkerIdFromColor = (color: string): string => {
  const normalized = color.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? `edge-arrow-${normalized}` : "edge-arrow-default";
};
