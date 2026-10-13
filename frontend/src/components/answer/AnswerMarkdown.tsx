"use client";

/**
 * Themed renderer for the markdown AST (Phase 20). Renders real headings,
 * lists, tables and callouts with existing PilotMate design tokens, embeds
 * YouTube links via the shared YouTubeEmbed (media-coordination aware), and
 * turns procedure-style tables into numbered step cards.
 */

import { useMemo, type ReactNode } from "react";
import { AlertTriangle, Check, Info, Lightbulb, ShieldAlert } from "lucide-react";
import { cn } from "cn";
import { parseInline, parseMarkdown, type Block, type Inline } from "@/lib/markdown";
import { extractYouTubeId } from "@/components/AiBlocks";
import YouTubeEmbed from "@/components/media/YouTubeEmbed";

/* ------------------------------------------------------------------ inline */

function InlineNodes({ nodes }: { nodes: Inline[] }): ReactNode {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return <span key={i}>{n.text}</span>;
          case "strong":
            return <strong key={i} className="font-semibold text-foreground"><InlineNodes nodes={n.content} /></strong>;
          case "em":
            return <em key={i}><InlineNodes nodes={n.content} /></em>;
          case "code":
            return (
              <code key={i} className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.85em]">
                {n.text}
              </code>
            );
          case "link":
            return <Anchor key={i} href={n.href} label={<InlineNodes nodes={n.content} />} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function Anchor({ href, label }: { href: string; label: ReactNode }) {
  const yt = extractYouTubeId(href);
  if (yt) {
    return (
      <span className="my-2 block">
        <YouTubeEmbed videoId={yt} title={typeof label === "string" ? label : href} />
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 break-all">
      {label}
    </a>
  );
}

/* ----------------------------------------------------------------- callouts */

const CALLOUT_KINDS: Record<string, { label: string; className: string; icon: ReactNode }> = {
  tip: { label: "Tip", className: "border-primary/40 bg-primary/5", icon: <Lightbulb className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> },
  note: { label: "Note", className: "border-border bg-muted/40", icon: <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> },
  important: { label: "Important", className: "border-caution/50 bg-caution/10", icon: <AlertTriangle className="h-3.5 w-3.5 text-caution" aria-hidden="true" /> },
  remember: { label: "Remember", className: "border-caution/50 bg-caution/10", icon: <AlertTriangle className="h-3.5 w-3.5 text-caution" aria-hidden="true" /> },
  caution: { label: "Caution", className: "border-caution/50 bg-caution/10", icon: <ShieldAlert className="h-3.5 w-3.5 text-caution" aria-hidden="true" /> },
  warning: { label: "Warning", className: "border-destructive/50 bg-destructive/10", icon: <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> },
  safety: { label: "Safety", className: "border-destructive/50 bg-destructive/10", icon: <ShieldAlert className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> },
  "correct answer": { label: "Correct answer", className: "border-success/50 bg-success/10", icon: <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> },
};

const CALLOUT_RE = /^(?:\*\*|__)?(tip|note|important|remember|caution|warning|safety|correct answer)(?:\*\*|__)?\s*:\s*([\s\S]*)$/i;
const STANDALONE_LINK_RE = /^\s*(?:\[([^\]]+)\]\()?(https?:\/\/[^)\s]+)\)?\s*$/;

function Callout({ kind, children }: { kind: string; children: ReactNode }) {
  const cfg = CALLOUT_KINDS[kind] ?? CALLOUT_KINDS.note;
  return (
    <div className={cn("flex gap-2 rounded-lg border-l-4 px-3 py-2", cfg.className)}>
      <span className="mt-0.5 shrink-0">{cfg.icon}</span>
      <div className="min-w-0 text-sm leading-relaxed">
        <span className="mr-1.5 font-semibold">{cfg.label}:</span>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ tables */

const PROCEDURE_HEADERS = /^(action|step|technique|purpose|what to do|how|entry|pitch|power|configuration|monitor|why it matters)\b/i;

function isProcedureTable(header: string[]): boolean {
  return header.length >= 2 && header.filter((h) => PROCEDURE_HEADERS.test(h)).length >= 2;
}

function ProcedureTable({ block }: { block: Extract<Block, { type: "table" }> }) {
  return (
    <ol className="flex flex-col gap-2">
      {block.rows.map((row, i) => (
        <li key={i} className="rounded-lg border border-border bg-card/60 px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">
              {i + 1}
            </span>
            {row[0]}
          </p>
          <dl className="grid gap-1 text-sm">
            {row.map((cell, j) =>
              j === 0 ? null : (
                <div key={j} className="grid grid-cols-[7rem_1fr] gap-x-3 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-xs leading-5 font-medium text-muted-foreground">{block.header[j] ?? `Column ${j + 1}`}</dt>
                  <dd className="leading-5"><InlineNodes nodes={parseInline(cell)} /></dd>
                </div>
              )
            )}
          </dl>
        </li>
      ))}
    </ol>
  );
}

function DataTable({ block }: { block: Extract<Block, { type: "table" }> }) {
  if (isProcedureTable(block.header)) return <ProcedureTable block={block} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/40">
            {block.header.map((h, i) => (
              <th key={i} className="border-b border-border px-3 py-2 text-left font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  <InlineNodes nodes={parseInline(cell)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ blocks */

const STEP_HEADING_RE = /(step[- ]by[- ]step|procedure|how to|checklist|steps)\b/i;

function ListBlock({ block, variant }: { block: Extract<Block, { type: "list" }>; variant: "steps" | "normal" }) {
  if (variant === "steps" && block.ordered) {
    return (
      <ol className="flex flex-col gap-2">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-2.5 rounded-lg border border-border bg-card/60 px-3 py-2.5">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <span className="min-w-0 text-sm leading-relaxed"><InlineNodes nodes={parseInline(item)} /></span>
          </li>
        ))}
      </ol>
    );
  }
  if (block.ordered) {
    return (
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
        {block.items.map((item, i) => (
          <li key={i}><InlineNodes nodes={parseInline(item)} /></li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
      {block.items.map((item, i) => (
        <li key={i}><InlineNodes nodes={parseInline(item)} /></li>
      ))}
    </ul>
  );
}

function ParagraphBlock({ block }: { block: Extract<Block, { type: "paragraph" }> }) {
  const callout = block.text.trim().match(CALLOUT_RE);
  if (callout) {
    const kind = callout[1].toLowerCase();
    return <Callout kind={kind}><InlineNodes nodes={parseInline(callout[2].trim())} /></Callout>;
  }
  // Standalone link (optionally labelled) → embedded player.
  const link = block.text.trim().match(STANDALONE_LINK_RE);
  if (link) {
    const url = link[2];
    const yt = extractYouTubeId(url);
    if (yt) {
      return (
        <span className="my-1 block">
          <YouTubeEmbed videoId={yt} title={link[1] ?? url} />
        </span>
      );
    }
  }
  return (
    <p className="text-sm leading-7">
      <InlineNodes nodes={block.inline} />
    </p>
  );
}

function HeadingBlock({ block, base }: { block: Extract<Block, { type: "heading" }>; base: number }) {
  // Body headings sit one level below their container title (section cards
  // render their own h3); level-1 headings keep the container level.
  const depth = Math.min(6, block.level === 1 ? base : base + 1);
  const Tag = (`h${depth}`) as "h3" | "h4" | "h5" | "h6";
  return (
    <Tag className={cn("font-semibold text-foreground", depth === 3 ? "text-base" : depth === 4 ? "text-sm" : "text-[13px]")}>
      {block.text}
    </Tag>
  );
}

/* ------------------------------------------------------------------- entry */

export function sectionWantsSteps(heading: string | null): boolean {
  return heading ? STEP_HEADING_RE.test(heading) : false;
}

export default function AnswerMarkdown({
  text,
  heading = null,
  baseHeadingLevel = 3,
}: {
  text: string;
  heading?: string | null;
  baseHeadingLevel?: number;
}) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const steps = sectionWantsSteps(heading);

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return <HeadingBlock key={i} block={block} base={baseHeadingLevel} />;
          case "paragraph":
            return <ParagraphBlock key={i} block={block} />;
          case "list":
            return <ListBlock key={i} block={block} variant={steps ? "steps" : "normal"} />;
          case "table":
            return <DataTable key={i} block={block} />;
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {block.text}
              </pre>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-primary/60 pl-3 text-sm leading-relaxed text-muted-foreground italic">
                <InlineNodes nodes={block.inline} />
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="border-border" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
