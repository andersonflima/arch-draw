import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from "node:zlib";

export type PackCompressionSettings = Readonly<{
  compressionLevel: number;
  useDictionary: boolean;
}>;

const magic = Buffer.from("ADPK1", "ascii");
const currentVersion = 1;
const compressionLevelMask = 0x0f;
const compressionDictionaryMask = 0x10;
const defaultCompressionLevel = 5;

const builtinDictionary = Buffer.from(
  [
    '"type","id","sessionToken","title","description","document","createdAt","updatedAt"',
    '"architecture","share","shareId","architectureId","ownerSessionToken","accessMode"',
    '"nodes","edges","position","size","properties","collapsed","expandedSize","style"',
    "arch-draw architecture diagram canvas container node edge connection share read-only edit",
    "software cloud database kubernetes mermaid yaml sql typescript javascript python"
  ].join("\n"),
  "utf8"
);

const toCompressionLevel = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultCompressionLevel;
  const normalized = Math.round(value);
  return Math.max(0, Math.min(11, normalized));
};

const encodeCompressionSettings = (settings: PackCompressionSettings): number =>
  (settings.compressionLevel & compressionLevelMask)
  | (settings.useDictionary ? compressionDictionaryMask : 0);

const parseCompressionSettings = (value: number | undefined): PackCompressionSettings => ({
  compressionLevel: (value ?? defaultCompressionLevel) & compressionLevelMask,
  useDictionary: ((value ?? 0) & compressionDictionaryMask) !== 0
});

const brotliOptions = (settings: PackCompressionSettings): Record<string, unknown> => {
  const options: Record<string, unknown> = {
    params: {
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      [zlibConstants.BROTLI_PARAM_QUALITY]: settings.compressionLevel
    }
  };

  if (settings.useDictionary) {
    options["dictionary"] = builtinDictionary;
  }

  return options;
};

export const encodeCompressedPack = (
  content: Buffer,
  settings: Partial<PackCompressionSettings> = {}
): Buffer => {
  const resolvedSettings = {
    compressionLevel: toCompressionLevel(settings.compressionLevel),
    useDictionary: settings.useDictionary ?? true
  };
  const compressed = brotliCompressSync(content, brotliOptions(resolvedSettings) as never);

  return Buffer.concat([
    magic,
    Buffer.from([currentVersion, encodeCompressionSettings(resolvedSettings)]),
    compressed
  ]);
};

export const decodeCompressedPack = (payload: Buffer): Buffer => {
  if (payload.length < magic.length + 2) {
    throw new Error("Invalid compressed architecture pack: too short.");
  }

  const payloadMagic = payload.subarray(0, magic.length);
  const version = payload[magic.length] ?? 0;
  if (!payloadMagic.equals(magic) || version !== currentVersion) {
    throw new Error("Invalid compressed architecture pack: unsupported format.");
  }

  const settings = parseCompressionSettings(payload[magic.length + 1]);
  return brotliDecompressSync(payload.subarray(magic.length + 2), brotliOptions(settings) as never);
};
