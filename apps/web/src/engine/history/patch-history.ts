export type IdentifiedEntity = Readonly<{
  id: string;
}>;

export type EntityPatch<TEntity extends IdentifiedEntity> = Readonly<{
  upsert: readonly TEntity[];
  remove: readonly string[];
  order: readonly string[];
}>;

export type DocumentPatch<TNode extends IdentifiedEntity, TEdge extends IdentifiedEntity> = Readonly<{
  title?: string;
  description?: string;
  mermaidSource?: string;
  nodes: EntityPatch<TNode>;
  edges: EntityPatch<TEdge>;
}>;

export type PatchHistoryEntry<TNode extends IdentifiedEntity, TEdge extends IdentifiedEntity> = Readonly<{
  forward: DocumentPatch<TNode, TEdge>;
  backward: DocumentPatch<TNode, TEdge>;
  signature: string;
}>;

export type PatchHistoryState<TNode extends IdentifiedEntity, TEdge extends IdentifiedEntity> = Readonly<{
  entries: readonly PatchHistoryEntry<TNode, TEdge>[];
  index: number;
}>;

export type PatchSnapshot<TNode extends IdentifiedEntity, TEdge extends IdentifiedEntity> = Readonly<{
  title: string;
  description: string;
  nodes: readonly TNode[];
  edges: readonly TEdge[];
  mermaidSource: string;
}>;

const toEntityMap = <TEntity extends IdentifiedEntity>(
  entities: readonly TEntity[]
): ReadonlyMap<string, TEntity> => new Map(entities.map((entity) => [entity.id, entity] as const));

const createEntityPatch = <TEntity extends IdentifiedEntity>(
  previous: readonly TEntity[],
  next: readonly TEntity[],
  serialize: (entity: TEntity) => string
): EntityPatch<TEntity> => {
  const previousById = toEntityMap(previous);
  const nextById = toEntityMap(next);
  const upsert: TEntity[] = [];
  const remove: string[] = [];

  for (const entity of next) {
    const previousEntity = previousById.get(entity.id);
    if (!previousEntity || serialize(previousEntity) !== serialize(entity)) {
      upsert.push(entity);
    }
  }

  for (const entity of previous) {
    if (!nextById.has(entity.id)) remove.push(entity.id);
  }

  return {
    upsert,
    remove,
    order: next.map((entity) => entity.id)
  };
};

export const createDocumentPatch = <TNode extends IdentifiedEntity, TEdge extends IdentifiedEntity>(
  previous: PatchSnapshot<TNode, TEdge>,
  next: PatchSnapshot<TNode, TEdge>,
  serializeNode: (node: TNode) => string,
  serializeEdge: (edge: TEdge) => string
): DocumentPatch<TNode, TEdge> => ({
  title: previous.title === next.title ? undefined : next.title,
  description: previous.description === next.description ? undefined : next.description,
  mermaidSource: previous.mermaidSource === next.mermaidSource ? undefined : next.mermaidSource,
  nodes: createEntityPatch(previous.nodes, next.nodes, serializeNode),
  edges: createEntityPatch(previous.edges, next.edges, serializeEdge)
});

const applyEntityPatch = <TEntity extends IdentifiedEntity>(
  entities: readonly TEntity[],
  patch: EntityPatch<TEntity>
): readonly TEntity[] => {
  const nextById = new Map(entities.map((entity) => [entity.id, entity] as const));

  for (const id of patch.remove) {
    nextById.delete(id);
  }
  for (const entity of patch.upsert) {
    nextById.set(entity.id, entity);
  }

  const ordered: TEntity[] = [];
  const orderedIds = new Set<string>();
  for (const id of patch.order) {
    const entity = nextById.get(id);
    if (!entity) continue;
    ordered.push(entity);
    orderedIds.add(id);
  }
  for (const entity of nextById.values()) {
    if (!orderedIds.has(entity.id)) ordered.push(entity);
  }
  return ordered;
};

export const applyDocumentPatch = <TNode extends IdentifiedEntity, TEdge extends IdentifiedEntity>(
  snapshot: PatchSnapshot<TNode, TEdge>,
  patch: DocumentPatch<TNode, TEdge>
): PatchSnapshot<TNode, TEdge> => ({
  title: patch.title ?? snapshot.title,
  description: patch.description ?? snapshot.description,
  mermaidSource: patch.mermaidSource ?? snapshot.mermaidSource,
  nodes: applyEntityPatch(snapshot.nodes, patch.nodes),
  edges: applyEntityPatch(snapshot.edges, patch.edges)
});

export const createHistoryEntry = <TNode extends IdentifiedEntity, TEdge extends IdentifiedEntity>(
  previous: PatchSnapshot<TNode, TEdge>,
  next: PatchSnapshot<TNode, TEdge>,
  signature: string,
  serializeNode: (node: TNode) => string,
  serializeEdge: (edge: TEdge) => string
): PatchHistoryEntry<TNode, TEdge> => ({
  forward: createDocumentPatch(previous, next, serializeNode, serializeEdge),
  backward: createDocumentPatch(next, previous, serializeNode, serializeEdge),
  signature
});

export const pushHistoryEntry = <TNode extends IdentifiedEntity, TEdge extends IdentifiedEntity>(
  state: PatchHistoryState<TNode, TEdge>,
  entry: PatchHistoryEntry<TNode, TEdge>,
  maxEntries: number
): PatchHistoryState<TNode, TEdge> => {
  const baseEntries = state.index < state.entries.length - 1
    ? state.entries.slice(0, state.index + 1)
    : state.entries;
  const entries = [...baseEntries, entry];
  const trimmed = entries.length > maxEntries
    ? entries.slice(entries.length - maxEntries)
    : entries;
  return {
    entries: trimmed,
    index: trimmed.length - 1
  };
};
