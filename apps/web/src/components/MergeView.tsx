/**
 * Side-by-side diff with CodeMirror 6's merge view. Loaded on demand (its own chunk), themed from
 * the design tokens so it matches Night and Day. Clicking a line number on the changed side starts
 * a review comment on that line.
 */
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { MergeView as CMMergeView } from "@codemirror/merge";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

const theme = EditorView.theme({
  "&": { backgroundColor: "var(--panel)", color: "var(--text)", fontSize: "12.5px", height: "100%" },
  ".cm-content": { fontFamily: "var(--font-mono)", caretColor: "var(--amber)" },
  ".cm-gutters": { backgroundColor: "var(--panel)", color: "var(--text-3)", border: "none", borderRight: "1px solid var(--line)" },
  ".cm-lineNumbers .cm-gutterElement": { cursor: "pointer", padding: "0 10px 0 14px" },
  ".cm-lineNumbers .cm-gutterElement:hover": { color: "var(--amber)" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-changedLine": { backgroundColor: "color-mix(in srgb, var(--ok) 10%, transparent) !important" },
  ".cm-deletedChunk": { backgroundColor: "color-mix(in srgb, var(--bad) 10%, transparent) !important" },
  ".cm-changedText": { background: "color-mix(in srgb, var(--ok) 26%, transparent) !important" },
  ".cm-deletedText": { background: "color-mix(in srgb, var(--bad) 26%, transparent) !important" },
  ".cm-mergeSpacer": { backgroundColor: "var(--sunken)" },
  ".cm-collapsedLines": { backgroundColor: "var(--raised)", color: "var(--text-3)", fontFamily: "var(--font-ui)" },
});

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword], color: "#ffb020" },
  { tag: [tags.string, tags.special(tags.string)], color: "#3ddc97" },
  { tag: [tags.number, tags.bool, tags.null], color: "#7aa2ff" },
  { tag: [tags.comment], color: "var(--text-3)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#e8eaed", fontWeight: "600" },
  { tag: [tags.typeName, tags.className], color: "#c3a6ff" },
]);

/** Each language arrives only when a file of its kind is opened. */
async function language(file: string): Promise<Extension> {
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(file)) return (await import("@codemirror/lang-javascript")).javascript({ typescript: /\.tsx?$/.test(file), jsx: /x$/.test(file) });
  if (/\.py$/.test(file)) return (await import("@codemirror/lang-python")).python();
  if (/\.md$/.test(file)) return (await import("@codemirror/lang-markdown")).markdown();
  if (/\.json$/.test(file)) return (await import("@codemirror/lang-json")).json();
  return [];
}

export default function MergeView({ file, before, after, onLine }: { file: string; before: string; after: string; onLine: (line: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  useEffect(() => {
    if (!host.current) return;
    const langA = new Compartment();
    const langB = new Compartment();
    const shared = [theme, syntaxHighlighting(highlight), EditorView.editable.of(false), EditorState.readOnly.of(true)];
    const view = new CMMergeView({
      parent: host.current,
      a: { doc: before, extensions: [...shared, langA.of([]), lineNumbers()] },
      b: {
        doc: after,
        extensions: [
          ...shared,
          langB.of([]),
          lineNumbers({
            domEventHandlers: {
              mousedown(editor, line) {
                onLineRef.current(editor.state.doc.lineAt(line.from).number);
                return true;
              },
            },
          }),
        ],
      },
      collapseUnchanged: { margin: 3, minSize: 6 },
      highlightChanges: true,
      gutter: true,
    });
    let alive = true;
    void language(file).then((lang) => {
      if (!alive) return;
      view.a.dispatch({ effects: langA.reconfigure(lang) });
      view.b.dispatch({ effects: langB.reconfigure(lang) });
    });
    return () => {
      alive = false;
      view.destroy();
    };
  }, [file, before, after]);

  return <div ref={host} className="h-full overflow-auto [&_.cm-mergeView]:h-full" aria-label={`Changes to ${file}`} />;
}
