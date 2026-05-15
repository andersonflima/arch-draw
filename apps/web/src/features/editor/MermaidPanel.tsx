import { useEffect, useId, useState, type KeyboardEvent } from "react";
import mermaid from "mermaid";
import { Wand2 } from "lucide-react";
import {
  insertMermaidIndent,
  insertMermaidLineBreak,
  removeMermaidIndent,
  type TextEditResult
} from "./mermaid-editor";

type MermaidPanelProps = Readonly<{
  source: string;
  onChange: (source: string) => void;
  onApply: () => void;
}>;

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: "base",
  themeVariables: {
    primaryColor: "#fff7ed",
    primaryBorderColor: "#111827",
    primaryTextColor: "#111827",
    lineColor: "#111827",
    fontFamily: "Inter, ui-sans-serif, system-ui"
  }
});

export const MermaidPanel = ({ source, onChange, onApply }: MermaidPanelProps) => {
  const renderId = useId().replaceAll(":", "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [lintStatus, setLintStatus] = useState<"empty" | "valid" | "invalid">("empty");

  useEffect(() => {
    let active = true;

    const render = async () => {
      if (source.trim().length === 0) {
        setSvg("");
        setError("");
        setLintStatus("empty");
        return;
      }

      try {
        await mermaid.parse(source);
        const result = await mermaid.render(`mermaid-${renderId}`, source);
        if (active) {
          setSvg(result.svg);
          setError("");
          setLintStatus("valid");
        }
      } catch (cause) {
        if (active) {
          setSvg("");
          setError(normalizeMermaidError(cause));
          setLintStatus("invalid");
        }
      }
    };

    void render();

    return () => {
      active = false;
    };
  }, [renderId, source]);

  return (
    <section className="mermaid-panel" aria-label="Mermaid editor">
      <div className="panel-heading">
        <div>
          <span>Mermaid</span>
          <small>Renderiza e transforma em nós editáveis.</small>
        </div>
        <button
          className="primary-action"
          type="button"
          disabled={lintStatus !== "valid"}
          onClick={onApply}
        >
          <Wand2 size={16} />
          Aplicar
        </button>
      </div>
      <textarea
        value={source}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          const textarea = event.currentTarget;
          const edit = getMermaidKeyboardEdit(event);
          if (!edit) return;

          event.preventDefault();
          onChange(edit.value);
          window.requestAnimationFrame(() => {
            textarea.setSelectionRange(edit.selection.start, edit.selection.end);
          });
        }}
        placeholder={'graph LR\n  User["User"] --> Api["API"]\n  Api --> Db["SQLite"]'}
      />
      <div className="mermaid-preview">
        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          <>
            <p className="lint-text">
              {lintStatus === "valid" ? "Mermaid válido" : "Informe um diagrama Mermaid"}
            </p>
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </>
        )}
      </div>
    </section>
  );
};

const normalizeMermaidError = (cause: unknown): string => {
  const message = cause instanceof Error ? cause.message : "Mermaid inválido";
  return message.replaceAll(/<[^>]+>/g, "").replaceAll(/\s+/g, " ").trim();
};

const getMermaidKeyboardEdit = (
  event: KeyboardEvent<HTMLTextAreaElement>
): TextEditResult | null => {
  const selection = {
    start: event.currentTarget.selectionStart,
    end: event.currentTarget.selectionEnd
  };

  if (event.key === "Tab") {
    return event.shiftKey
      ? removeMermaidIndent(event.currentTarget.value, selection)
      : insertMermaidIndent(event.currentTarget.value, selection);
  }

  if (event.key === "Enter") {
    return insertMermaidLineBreak(event.currentTarget.value, selection);
  }

  return null;
};
