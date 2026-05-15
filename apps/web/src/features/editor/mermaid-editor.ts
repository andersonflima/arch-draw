export const MERMAID_INDENT = "  ";

export type TextSelection = Readonly<{
  start: number;
  end: number;
}>;

export type TextEditResult = Readonly<{
  value: string;
  selection: TextSelection;
}>;

export const insertMermaidIndent = (
  value: string,
  selection: TextSelection
): TextEditResult =>
  selection.start === selection.end
    ? insertAtCursor(value, selection, MERMAID_INDENT)
    : indentSelectedLines(value, selection);

export const removeMermaidIndent = (
  value: string,
  selection: TextSelection
): TextEditResult => outdentSelectedLines(value, selection);

export const insertMermaidLineBreak = (
  value: string,
  selection: TextSelection
): TextEditResult => {
  const lineStart = value.lastIndexOf("\n", selection.start - 1) + 1;
  const currentIndent = value.slice(lineStart, selection.start).match(/^[ \t]*/)?.[0] ?? "";

  return insertAtCursor(value, selection, `\n${currentIndent}`);
};

const insertAtCursor = (
  value: string,
  selection: TextSelection,
  text: string
): TextEditResult => {
  const nextValue = `${value.slice(0, selection.start)}${text}${value.slice(selection.end)}`;
  const nextCursor = selection.start + text.length;

  return {
    value: nextValue,
    selection: {
      start: nextCursor,
      end: nextCursor
    }
  };
};

const indentSelectedLines = (
  value: string,
  selection: TextSelection
): TextEditResult => {
  const range = getLineRange(value, selection);
  const selected = value.slice(range.start, range.end);
  const indented = selected
    .split("\n")
    .map((line) => `${MERMAID_INDENT}${line}`)
    .join("\n");
  const lineCount = selected.split("\n").length;

  return {
    value: `${value.slice(0, range.start)}${indented}${value.slice(range.end)}`,
    selection: {
      start: selection.start + MERMAID_INDENT.length,
      end: selection.end + MERMAID_INDENT.length * lineCount
    }
  };
};

const outdentSelectedLines = (
  value: string,
  selection: TextSelection
): TextEditResult => {
  const range = getLineRange(value, selection);
  const selected = value.slice(range.start, range.end);
  const lines = selected.split("\n");
  const outdentedLines = lines.map(removeLineIndent);
  const removedBeforeStart = countRemovedCharactersBeforeSelectionStart(
    lines,
    selection.start - range.start
  );
  const removedTotal = lines.reduce((total, line) => total + countRemovableIndent(line), 0);

  return {
    value: `${value.slice(0, range.start)}${outdentedLines.join("\n")}${value.slice(range.end)}`,
    selection: {
      start: Math.max(range.start, selection.start - removedBeforeStart),
      end: Math.max(range.start, selection.end - removedTotal)
    }
  };
};

const getLineRange = (
  value: string,
  selection: TextSelection
): TextSelection => {
  const start = value.lastIndexOf("\n", selection.start - 1) + 1;
  const endLineBreak = value.indexOf("\n", selection.end);

  return {
    start,
    end: endLineBreak === -1 ? value.length : endLineBreak
  };
};

const removeLineIndent = (line: string): string =>
  line.startsWith(MERMAID_INDENT)
    ? line.slice(MERMAID_INDENT.length)
    : line.startsWith("\t")
      ? line.slice(1)
      : line;

const countRemovableIndent = (line: string): number =>
  line.startsWith(MERMAID_INDENT) ? MERMAID_INDENT.length : line.startsWith("\t") ? 1 : 0;

const countRemovedCharactersBeforeSelectionStart = (
  lines: readonly string[],
  relativeSelectionStart: number
): number => {
  let consumed = 0;
  let removed = 0;

  for (const line of lines) {
    if (consumed >= relativeSelectionStart) return removed;
    removed += countRemovableIndent(line);
    consumed += line.length + 1;
  }

  return removed;
};
