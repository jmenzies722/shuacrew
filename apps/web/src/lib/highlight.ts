/**
 * Syntax highlighting for code in the thread, with the same parsers as the diff view. Loaded on
 * first use (it's a separate chunk), so a conversation without code never pays for it.
 */
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { StreamLanguage, type LanguageSupport, type Language } from "@codemirror/language";
import { go } from "@codemirror/legacy-modes/mode/go";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { classHighlighter, highlightTree } from "@lezer/highlight";

const languages: Record<string, () => Language | LanguageSupport> = {
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  json: () => json(),
  py: () => python(),
  sh: () => StreamLanguage.define(shell),
  swift: () => StreamLanguage.define(swift),
  go: () => StreamLanguage.define(go),
  rs: () => StreamLanguage.define(rust),
  yaml: () => StreamLanguage.define(yaml),
  toml: () => StreamLanguage.define(toml),
  diff: () => StreamLanguage.define(diff),
};
const ALIASES: Record<string, string> = {
  typescript: "ts", javascript: "js", python: "py", bash: "sh", shell: "sh", zsh: "sh", console: "sh",
  rust: "rs", yml: "yaml", patch: "diff", mjs: "js", cjs: "js", mts: "ts",
};

export function languageOf(hint: string | undefined): string | undefined {
  if (!hint) return undefined;
  const key = hint.toLowerCase().replace(/^.*\./, "");
  const name = ALIASES[key] ?? key;
  return languages[name] ? name : undefined;
}

export interface Token {
  text: string;
  className?: string;
}

/** Lines of classed tokens (`tok-keyword`, `tok-string`, …), styled in styles.css. */
export function highlight(code: string, hint: string | undefined): Token[][] {
  const name = languageOf(hint);
  const lines: Token[][] = [[]];
  const push = (text: string, className?: string) => {
    const parts = text.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1]!.push({ text: part, className });
    });
  };
  if (!name) {
    push(code);
    return lines;
  }
  const made = languages[name]!();
  const language = "language" in made ? made.language : made;
  const tree = language.parser.parse(code);
  let pos = 0;
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > pos) push(code.slice(pos, from));
    push(code.slice(from, to), classes);
    pos = to;
  });
  if (pos < code.length) push(code.slice(pos));
  return lines;
}
