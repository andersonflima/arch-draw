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
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { Compartment, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from "@codemirror/view";
import { go } from "@codemirror/lang-go";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { elixir } from "codemirror-lang-elixir";

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
  private readonly languageCompartment = new Compartment();
  private readonly readOnlyCompartment = new Compartment();
  private isApplyingExternalValue = false;

  ngAfterViewInit(): void {
    const extensions: Extension[] = [
      oneDark,
      lineNumbers(),
      highlightActiveLineGutter(),
      drawSelection(),
      EditorView.lineWrapping,
      EditorView.theme({
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
      history(),
      foldGutter(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        ...completionKeymap
      ]),
      this.languageCompartment.of(this.getLanguageExtension(this.language)),
      this.readOnlyCompartment.of(EditorView.editable.of(!this.readOnly)),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged || this.isApplyingExternalValue) return;
        this.valueChange.emit(update.state.doc.toString());
      }),
      EditorView.domEventHandlers({
        blur: () => {
          this.editorBlur.emit();
        }
      })
    ];

    this.editorView = new EditorView({
      doc: this.value,
      extensions,
      parent: this.hostRef.nativeElement
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.editorView) return;

    if (changes["language"]) {
      this.editorView.dispatch({
        effects: this.languageCompartment.reconfigure(this.getLanguageExtension(this.language))
      });
    }

    if (changes["readOnly"]) {
      this.editorView.dispatch({
        effects: this.readOnlyCompartment.reconfigure(EditorView.editable.of(!this.readOnly))
      });
    }

    if (changes["value"] && typeof this.value === "string") {
      const current = this.editorView.state.doc.toString();
      if (current !== this.value) {
        this.isApplyingExternalValue = true;
        this.editorView.dispatch({
          changes: { from: 0, to: current.length, insert: this.value }
        });
        this.isApplyingExternalValue = false;
      }
    }
  }

  ngOnDestroy(): void {
    this.editorView?.destroy();
    this.editorView = null;
  }

  private getLanguageExtension(language: string): Extension {
    switch (language.toLowerCase()) {
      case "python":
        return python();
      case "javascript":
        return javascript({ typescript: false });
      case "nodejs":
      case "typescript":
        return javascript({ typescript: true });
      case "markdown":
        return markdown();
      case "go":
        return go();
      case "rust":
        return rust();
      case "java":
        return java();
      case "elixir":
        return elixir();
      default:
        return javascript({ typescript: true });
    }
  }
}
