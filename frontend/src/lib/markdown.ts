/**
 * Minimal, dependency-free Markdown parser for AI answers (Phase 20).
 *
 * Produces a small AST the React layer styles. Deliberately conservative:
 * - Never throws — malformed input degrades to readable text (test 10).
 * - No HTML string handling at all: only typed nodes reach React, so
 *   untrusted AI output cannot inject markup (XSS-safe by construction).
 * - Covers the constructs agents actually emit: ATX headings, paragraphs,
 *   bullet/numbered lists, pipe tables, fenced code, blockquotes, rules,
 *   and the inline set bold/italic/code/links (incl. bare URLs).
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; content: Inline[] }
  | { type: "em"; content: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; content: Inline[] };

export type Block =
  | { type: "heading"; level: number; text: string; inline: Inline[] }
  | { type: "paragraph"; text: string; inline: Inline[] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; lang: string; text: string }
  | { type: "quote"; text: string; inline: Inline[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "hr" };

/* ------------------------------------------------------------------ inline */

// Named groups — backreferences (\k<x>) are unambiguous across alternatives,
// unlike numeric \1 which always points at absolute group 1.
const INLINE_RE = new RegExp(
  [
    "(?<tick>`+)(?<code>[^`]|[^`][\\s\\S]*?[^`])\\k<tick>(?!`)", // inline code
    "(?<sm>\\*\\*|__)(?<smin>[\\s\\S]+?)\\k<sm>", // strong
    "(?<em>\\*|_)(?<emi>[^\\s*][\\s\\S]*?[^\\s*]|\\S)\\k<em>(?!\\w)", // em
    "\\[(?<ll>[^\\]]+)\\]\\((?<lu>https?:\\/\\/[^)\\s]+)\\)", // [label](url)
    "(?<bu>https?:\\/\\/[^\\s<>()\\[\\]]+)", // bare URL
  ].join("|"),
  "g"
);

/** Parse inline markdown. Unmatched markers stay literal text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_RE.source, "g");

  const pushText = (s: string) => {
    if (!s) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === "text") prev.text += s;
    else out.push({ type: "text", text: s });
  };

  while ((m = re.exec(text)) !== null) {
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;
    const g = m.groups ?? {};
    if (g.code !== undefined) {
      out.push({ type: "code", text: g.code });
    } else if (g.smin !== undefined) {
      out.push({ type: "strong", content: parseInline(stripPair(g.smin)) });
    } else if (g.emi !== undefined) {
      out.push({ type: "em", content: parseInline(stripPair(g.emi)) });
    } else if (g.ll !== undefined) {
      out.push({ type: "link", href: g.lu, content: [{ type: "text", text: g.ll }] });
    } else if (g.bu !== undefined) {
      out.push({ type: "link", href: g.bu, content: [{ type: "text", text: g.bu }] });
    }
  }
  pushText(text.slice(last));
  return out;
}

function stripPair(s: string): string {
  // "**x**" captured inner may still hold stray markers on malformed input.
  return s.replace(/^(\*\*|__|\*|_)/, "").replace(/(\*\*|__|\*|_)$/, "");
}

/* ------------------------------------------------------------------ blocks */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** Parse a full markdown document into blocks. Never throws. */
export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = (src ?? "").replace(/\r\n?/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Fenced code — consume to closing fence or EOF (unclosed fence fallback).
    const fence = line.match(/^\s*(```+|~~~+)\s*(\S*)\s*$/);
    if (fence) {
      const marker = fence[1][0];
      const lang = fence[2] ?? "";
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${marker === "`" ? "```" : "~~~"}`).test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // skip closing fence
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      const text = heading[2].replace(/\s+#+\s*$/, "").trim();
      blocks.push({ type: "heading", level: heading[1].length, text, inline: parseInline(text) });
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // Pipe table: header row + separator row.
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = splitTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      if (header.length > 0 && rows.length > 0) {
        blocks.push({ type: "table", header, rows });
      } else {
        // Separator found but no rows — degrade to paragraph text.
        const text = [line, ...rows.map((r) => r.join(" | "))].join("\n");
        blocks.push({ type: "paragraph", text, inline: parseInline(text) });
      }
      continue;
    }

    // Lists (bullet or numbered) — consecutive items, single level.
    const ul = line.match(UL_RE);
    const ol = line.match(OL_RE);
    if (ul || ol) {
      const ordered = Boolean(ol);
      const items: string[] = [];
      while (i < lines.length) {
        const m = ordered ? lines[i].match(OL_RE) : lines[i].match(UL_RE);
        if (!m) break;
        items.push(m[1].trim());
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Blockquote — consecutive "> " lines.
    if (QUOTE_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(QUOTE_RE);
        if (!m) break;
        buf.push(m[1]);
        i += 1;
      }
      const text = buf.join("\n");
      blocks.push({ type: "quote", text, inline: parseInline(text) });
      continue;
    }

    // Paragraph — until blank line or a structural line.
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      const l = lines[i];
      if (
        buf.length > 0 &&
        (HEADING_RE.test(l) || HR_RE.test(l) || /^\s*(```|~~~)/.test(l) ||
          QUOTE_RE.test(l) || UL_RE.test(l) || OL_RE.test(l) ||
          (l.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])))
      ) {
        break;
      }
      buf.push(l);
      i += 1;
    }
    const text = buf.join("\n");
    blocks.push({ type: "paragraph", text, inline: parseInline(text) });
  }

  return blocks;
}

/** Word count for short-answer detection. */
export function countWords(text: string): number {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}
