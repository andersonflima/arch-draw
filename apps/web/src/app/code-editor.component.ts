import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from "@angular/core";
import type { Compartment, Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// CodeMirror (core + language packs) is the heaviest dependency in the web app.
// It is only needed when a code block is actually expanded, so the whole engine
// is split into a lazily-loaded chunk and pulled in on first editor creation
// instead of inflating the initial bundle and startup parse cost.
type CodeMirrorCore = Awaited<ReturnType<typeof loadCodeMirrorCore>>;
type LanguageLoader = () => Promise<Extension>;

let codeMirrorCorePromise: Promise<CodeMirrorCore> | null = null;

async function loadCodeMirrorCore() {
  const [
    autocomplete,
    commands,
    language,
    state,
    themeOneDark,
    vimMode,
    view
  ] = await Promise.all([
    import("@codemirror/autocomplete"),
    import("@codemirror/commands"),
    import("@codemirror/language"),
    import("@codemirror/state"),
    import("@codemirror/theme-one-dark"),
    import("@replit/codemirror-vim"),
    import("@codemirror/view")
  ]);

  return {
    autocompletion: autocomplete.autocompletion,
    closeBrackets: autocomplete.closeBrackets,
    closeBracketsKeymap: autocomplete.closeBracketsKeymap,
    completionKeymap: autocomplete.completionKeymap,
    defaultKeymap: commands.defaultKeymap,
    history: commands.history,
    historyKeymap: commands.historyKeymap,
    indentWithTab: commands.indentWithTab,
    bracketMatching: language.bracketMatching,
    foldGutter: language.foldGutter,
    indentOnInput: language.indentOnInput,
    Compartment: state.Compartment,
    oneDark: themeOneDark.oneDark,
    vim: vimMode.vim,
    drawSelection: view.drawSelection,
    EditorView: view.EditorView,
    highlightActiveLineGutter: view.highlightActiveLineGutter,
    keymap: view.keymap,
    lineNumbers: view.lineNumbers
  };
}

function loadCodeMirrorCoreOnce(): Promise<CodeMirrorCore> {
  codeMirrorCorePromise ??= loadCodeMirrorCore();
  return codeMirrorCorePromise;
}

const loadTypeScriptLanguage: LanguageLoader = async () =>
  (await import("@codemirror/lang-javascript")).javascript({ typescript: true });

const LANGUAGE_LOADERS: Readonly<Record<string, LanguageLoader>> = {
  python: async () => (await import("@codemirror/lang-python")).python(),
  javascript: async () => (await import("@codemirror/lang-javascript")).javascript({ typescript: false }),
  typescript: loadTypeScriptLanguage,
  nodejs: loadTypeScriptLanguage,
  sql: async () => (await import("@codemirror/lang-sql")).sql(),
  markdown: async () => (await import("@codemirror/lang-markdown")).markdown(),
  mermaid: async () => (await import("@codemirror/lang-markdown")).markdown(),
  yaml: async () => (await import("@codemirror/lang-yaml")).yaml(),
  go: async () => (await import("@codemirror/lang-go")).go(),
  rust: async () => (await import("@codemirror/lang-rust")).rust(),
  java: async () => (await import("@codemirror/lang-java")).java(),
  elixir: async () => (await import("codemirror-lang-elixir")).elixir()
};

function loadLanguageExtension(language: string): Promise<Extension> {
  const loader = LANGUAGE_LOADERS[language.toLowerCase()] ?? loadTypeScriptLanguage;
  return loader();
}

@Component({
  selector: "app-code-editor",
  standalone: true,
  imports: [CommonModule],
  template: `<div #host class="code-editor-host" (pointerdown)="$event.stopPropagation()"></div>`
})
export class CodeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild("host", { static: true }) private readonly hostRef!: ElementRef<HTMLDivElement>;

  @Input() value = "";
  @Input() language = "typescript";
  @Input() readOnly = false;

  @Output() valueChange = new EventEmitter<string>();
  @Output() editorBlur = new EventEmitter<void>();

  private editorView: EditorView | null = null;
  private core: CodeMirrorCore | null = null;
  private languageCompartment: Compartment | null = null;
  private readOnlyCompartment: Compartment | null = null;
  private isApplyingExternalValue = false;
  private isDestroyed = false;
  private appliedLanguage = "";

  ngAfterViewInit(): void {
    void this.setupEditor();
  }

  private async setupEditor(): Promise<void> {
    const [core, languageExtension] = await Promise.all([
      loadCodeMirrorCoreOnce(),
      loadLanguageExtension(this.language)
    ]);
    if (this.isDestroyed) return;

    this.core = core;
    this.appliedLanguage = this.language;
    this.languageCompartment = new core.Compartment();
    this.readOnlyCompartment = new core.Compartment();

    const extensions: Extension[] = [
      core.oneDark,
      core.lineNumbers(),
      core.highlightActiveLineGutter(),
      core.drawSelection(),
      core.vim(),
      core.EditorView.lineWrapping,
      core.EditorView.theme({
        "&": {
          height: "100%"
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: "\"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace",
          fontSize: "11px",
          lineHeight: "1.45"
        },
        ".cm-content": {
          padding: "8px 10px"
        }
      }),
      core.history(),
      core.foldGutter(),
      core.indentOnInput(),
      core.bracketMatching(),
      core.closeBrackets(),
      core.autocompletion(),
      core.keymap.of([
        core.indentWithTab,
        ...core.defaultKeymap,
        ...core.historyKeymap,
        ...core.closeBracketsKeymap,
        ...core.completionKeymap
      ]),
      this.languageCompartment.of(languageExtension),
      this.readOnlyCompartment.of(core.EditorView.editable.of(!this.readOnly)),
      core.EditorView.updateListener.of((update) => {
        if (!update.docChanged || this.isApplyingExternalValue) return;
        this.valueChange.emit(update.state.doc.toString());
      }),
      core.EditorView.domEventHandlers({
        blur: () => {
          this.editorBlur.emit();
        }
      })
    ];

    this.editorView = new core.EditorView({
      doc: this.value,
      extensions,
      parent: this.hostRef.nativeElement
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    const view = this.editorView;
    const core = this.core;
    if (!view || !core) return;

    if (changes["language"]) {
      void this.applyLanguage(this.language);
    }

    if (changes["readOnly"] && this.readOnlyCompartment) {
      view.dispatch({
        effects: this.readOnlyCompartment.reconfigure(core.EditorView.editable.of(!this.readOnly))
      });
    }

    if (changes["value"] && typeof this.value === "string") {
      const current = view.state.doc.toString();
      if (current !== this.value) {
        this.isApplyingExternalValue = true;
        view.dispatch({
          changes: { from: 0, to: current.length, insert: this.value }
        });
        this.isApplyingExternalValue = false;
      }
    }
  }

  private async applyLanguage(language: string): Promise<void> {
    if (language === this.appliedLanguage) return;
    const extension = await loadLanguageExtension(language);
    const view = this.editorView;
    const compartment = this.languageCompartment;
    if (this.isDestroyed || !view || !compartment) return;
    // A newer language change may have superseded this one while loading.
    if (this.language !== language) return;
    this.appliedLanguage = language;
    view.dispatch({
      effects: compartment.reconfigure(extension)
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.editorView?.destroy();
    this.editorView = null;
    this.core = null;
    this.languageCompartment = null;
    this.readOnlyCompartment = null;
  }
}
