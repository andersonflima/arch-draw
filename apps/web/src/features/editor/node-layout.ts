export type NodeSize = Readonly<{ width: number; height: number }>;

export type NodePortMetricsLimits = Readonly<{
  minHitWidth: number;
  maxHitWidth: number;
  minInset: number;
  maxInset: number;
  minDotSize: number;
  maxDotSize: number;
  minOmniSize: number;
  maxOmniSize: number;
}>;

export type NodePortMetrics = Readonly<{
  hitWidth: number;
  hitInset: number;
  hitMinHeight: number;
  dotSize: number;
  edgeOffset: number;
  laneInset: number;
  laneWidth: number;
  omniSize: number;
  omniOffset: number;
  omniHaloSize: number;
}>;

export const computeNodePortMetrics = (
  size: NodeSize,
  limits: NodePortMetricsLimits
): NodePortMetrics => {
  const nodePortScaleBasis = Math.max(48, Math.min(size.width, size.height));
  const hitWidth = Math.round(
    Math.min(limits.maxHitWidth, Math.max(limits.minHitWidth, nodePortScaleBasis * 0.18))
  );
  const hitInset = Math.round(
    Math.min(limits.maxInset, Math.max(limits.minInset, nodePortScaleBasis * 0.11))
  );
  const dotSize = Math.round(
    Math.min(limits.maxDotSize, Math.max(limits.minDotSize, hitWidth * 0.48))
  );
  const edgeOffset = dotSize + 1;
  const laneInset = Math.round(Math.max(0, Math.min(6, hitInset * 0.6)));
  const laneWidth = Math.round(Math.max(3, Math.min(6, hitWidth * 0.22)));
  const hitMinHeight = Math.round(Math.max(28, hitWidth + 10));
  const omniSize = Math.round(
    Math.min(limits.maxOmniSize, Math.max(limits.minOmniSize, hitWidth))
  );
  const omniOffset = Math.round(omniSize / 2 + 1);
  const omniHaloSize = Math.round(Math.max(14, Math.min(22, dotSize + 4)));

  return {
    hitWidth,
    hitInset,
    hitMinHeight,
    dotSize,
    edgeOffset,
    laneInset,
    laneWidth,
    omniSize,
    omniOffset,
    omniHaloSize
  };
};

export const computeLeafNodeIconSize = (params: Readonly<{
  nodeSize: NodeSize;
  nodeIconSize: number;
  defaultNodeIconSize: number;
  leafAnchorIconSize: number;
  leafAnchorTopOffset: number;
  minSize?: number;
}>): number => {
  const minSize = params.minSize ?? 32;
  const maxByWidth = Math.max(minSize, params.nodeSize.width - 20);
  const maxByHeight = Math.max(minSize, params.nodeSize.height - params.leafAnchorTopOffset - 14);
  const maxByGlobalScale = Math.max(
    minSize,
    (params.nodeIconSize / params.defaultNodeIconSize) * params.leafAnchorIconSize
  );
  return Math.max(minSize, Math.round(Math.min(maxByWidth, maxByHeight, maxByGlobalScale)));
};

export const computeLeafLabelCharacterLimit = (params: Readonly<{
  nodeWidth: number;
  nodeIconSize: number;
  defaultNodeIconSize: number;
  baseChars: number;
  maxChars: number;
}>): number => {
  const widthGain = Math.max(0, params.nodeWidth - 108);
  const iconGain = Math.max(0, params.nodeIconSize - params.defaultNodeIconSize);
  const dynamicLimit = params.baseChars + Math.round(widthGain / 6) + Math.round(iconGain / 14);
  return Math.max(params.baseChars, Math.min(params.maxChars, dynamicLimit));
};

export const truncateLeafNodeLabel = (label: string, characterLimit: number): string => {
  if (label.length <= characterLimit) return label;

  const safeLimit = Math.max(10, characterLimit);
  const cutoff = safeLimit - 3;
  const words = label.split(" ").filter((token) => token.length > 0);
  if (words.length === 0) {
    return `${label.slice(0, cutoff)}...`;
  }

  if (words.length === 1) {
    const firstWord = words[0] ?? label;
    if (firstWord.length <= cutoff) return firstWord;
    return `${firstWord.slice(0, cutoff)}...`;
  }

  if (words.length === 2) {
    const composed = `${words[0] ?? ""} ${words[1] ?? ""}`.trim();
    if (composed.length === 0) return `${label.slice(0, cutoff)}...`;
    return composed.length <= characterLimit ? composed : `${composed.slice(0, cutoff)}...`;
  }

  const firstTwoWords = `${words[0] ?? ""} ${words[1] ?? ""}`.trim();
  if (firstTwoWords.length === 0) {
    return `${label.slice(0, cutoff)}...`;
  }

  const thirdWord = words[2] ?? "";
  const remaining = cutoff - firstTwoWords.length - 1;
  if (remaining > 0 && thirdWord.length > 0) {
    return `${firstTwoWords} ${thirdWord.slice(0, remaining)}...`;
  }

  return `${firstTwoWords}...`;
};
