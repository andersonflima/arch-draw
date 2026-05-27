import { rectContainsPoint, rectsIntersect, type SpatialPoint, type SpatialRect } from "./geometry";

export type SpatialEntry<T> = Readonly<{
  id: string;
  rect: SpatialRect;
  value: T;
}>;

type GridKey = `${number}:${number}`;

const toCellRange = (
  rect: SpatialRect,
  cellSize: number
): Readonly<{ minX: number; maxX: number; minY: number; maxY: number }> => ({
  minX: Math.floor(rect.x / cellSize),
  maxX: Math.floor((rect.x + rect.width) / cellSize),
  minY: Math.floor(rect.y / cellSize),
  maxY: Math.floor((rect.y + rect.height) / cellSize)
});

const toGridKey = (x: number, y: number): GridKey => `${x}:${y}`;

export class UniformGridSpatialIndex<T> {
  private readonly cells = new Map<GridKey, SpatialEntry<T>[]>();
  private readonly entriesById = new Map<string, SpatialEntry<T>>();

  constructor(
    entries: readonly SpatialEntry<T>[],
    private readonly cellSize = 512
  ) {
    for (const entry of entries) {
      this.insert(entry);
    }
  }

  get size(): number {
    return this.entriesById.size;
  }

  get(id: string): SpatialEntry<T> | null {
    return this.entriesById.get(id) ?? null;
  }

  query(rect: SpatialRect): readonly SpatialEntry<T>[] {
    const result: SpatialEntry<T>[] = [];
    const seen = new Set<string>();
    const range = toCellRange(rect, this.cellSize);

    for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
      for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
        const entries = this.cells.get(toGridKey(cellX, cellY));
        if (!entries) continue;

        for (const entry of entries) {
          if (seen.has(entry.id)) continue;
          if (!rectsIntersect(entry.rect, rect)) continue;
          seen.add(entry.id);
          result.push(entry);
        }
      }
    }

    return result;
  }

  queryPoint(point: SpatialPoint): readonly SpatialEntry<T>[] {
    const key = toGridKey(
      Math.floor(point.x / this.cellSize),
      Math.floor(point.y / this.cellSize)
    );
    const entries = this.cells.get(key) ?? [];
    return entries.filter((entry) => rectContainsPoint(entry.rect, point));
  }

  private insert(entry: SpatialEntry<T>): void {
    this.entriesById.set(entry.id, entry);
    const range = toCellRange(entry.rect, this.cellSize);

    for (let cellX = range.minX; cellX <= range.maxX; cellX += 1) {
      for (let cellY = range.minY; cellY <= range.maxY; cellY += 1) {
        const key = toGridKey(cellX, cellY);
        const bucket = this.cells.get(key);
        if (bucket) {
          bucket.push(entry);
        } else {
          this.cells.set(key, [entry]);
        }
      }
    }
  }
}

export const createSpatialIndex = <T>(
  entries: readonly SpatialEntry<T>[],
  cellSize?: number
): UniformGridSpatialIndex<T> => new UniformGridSpatialIndex(entries, cellSize);
