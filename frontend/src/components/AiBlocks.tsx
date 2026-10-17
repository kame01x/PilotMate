"use client";

import type { ReactNode } from "react";
import type { ContentBlock } from "@/lib/preflightStream";
import YouTubeEmbed from "@/components/media/YouTubeEmbed";

/**
 * Extract a YouTube video ID (exactly 11 chars) from any common URL form:
 * watch?v=, watch?...&v=, youtu.be/, shorts/, embed/, v/, live/.
 * Truncated/invalid IDs are rejected (Phase 21A) — never embed a broken player.
 */
export function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?(?:[^#\s]*&)?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/
  );
  return m ? m[1] : null;
}

/**
 * Coerce a block field to renderable text. Backend specialists stringify at
 * the source, but a stray object (e.g. an API payload that leaked into a kv
 * row) must never white-screen the briefing — degrade to readable text.
 */
export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["name", "title", "label", "value"]) {
      if (typeof obj[key] === "string") return obj[key];
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Verified video card: embeds the real player when the block carries a valid
 * YouTube ID (Phase 21A — a thumbnail alone never counts), keeping the
 * title/channel/snippet metadata and the external link. Falls back to the
 * thumbnail + link only when no embeddable ID can be derived.
 */
export function VideoCard({ block }: { block: Extract<ContentBlock, { type: "video" }> }) {
  const ytId =
    (block.video_id && /^[A-Za-z0-9_-]{11}$/.test(block.video_id) && block.video_id) ||
    extractYouTubeId(block.url) ||
    extractYouTubeId(block.embed_url) ||
    null;
  return (
    <div
      className={`flex flex-col gap-2 rounded-md border border-border bg-card p-3 ${
        ytId ? "" : "sm:flex-row"
      }`}
    >
      {ytId ? (
        <div className="w-full sm:max-w-[480px]">
          <YouTubeEmbed
            videoId={ytId}
            title={block.title ?? "Training video"}
            sourceUrl={block.url}
          />
        </div>
      ) : (
        block.thumbnail_url && (
          <a href={block.url} target="_blank" rel="noreferrer" className="block shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={block.thumbnail_url}
              alt={block.title ?? "Training video"}
              className="aspect-video w-full max-w-[220px] rounded-md border object-cover"
            />
          </a>
        )
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <a href={block.url} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
          {block.title ?? "Untitled video"}
        </a>
        {block.channel && <p className="text-xs text-muted-foreground">{block.channel}</p>}
        {block.preferred_source && (
          <p className="text-xs text-primary">Preferred training source</p>
        )}
        {block.search_snippet && (
          <p className="text-xs text-muted-foreground line-clamp-2">{block.search_snippet}</p>
        )}
        <p className="text-[11px] text-muted-foreground">Verified via YouTube oEmbed — watch before relying on it for a flight.</p>
      </div>
    </div>
  );
}

/** Render structured content blocks. Handles links + YouTube URLs inside text. */
export function AiBlocks({ blocks }: { blocks: ContentBlock[] }) {
  if (!blocks || blocks.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <AiBlock key={i} block={block} />
      ))}
    </div>
  );
}

function AiBlock({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "heading":
      return <h4 className="text-sm font-semibold text-foreground">{asText(block.text)}</h4>;
    case "paragraph":
      return <LinkifiedText text={asText(block.text)} className="text-sm leading-relaxed" />;
    case "bullets":
      return (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {block.items.map((item, i) => (
            <li key={i}>
              <LinkifiedText text={asText(item)} className="inline" />
            </li>
          ))}
        </ul>
      );
    case "numbered":
      return (
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
          {block.items.map((item, i) => (
            <li key={i}>
              <LinkifiedText text={asText(item)} className="inline" />
            </li>
          ))}
        </ol>
      );
    case "kv":
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {block.rows.map((row, i) => (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{asText(row.label)}</dt>
              <dd className="text-foreground">{asText(row.value)}</dd>
            </div>
          ))}
        </dl>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {asText(block.text)}
        </pre>
      );
    case "warning":
      return (
        <div className="rounded-sm border border-caution/40 bg-caution/10 px-3 py-2 text-xs text-caution">
          {asText(block.text)}
        </div>
      );
    case "video":
      return <VideoCard block={block} />;
    default:
      return null;
  }
}

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;

/** Inline text with markdown links + YouTube embeds (reuses ChatPanel's approach). */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  // Fresh regex instance per render — avoids mutating shared state (lint + SSR safety)
  const re = new RegExp(LINK_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const label = match[1] ?? match[3];
    const url = match[2] ?? match[3];
    const id = extractYouTubeId(url);
    if (id) {
      nodes.push(
        <YouTubeEmbed
          key={i++}
          videoId={id}
          title={label}
          sourceUrl={url}
          className="my-2"
        />
      );
    } else {
      nodes.push(
        <a key={i++} href={url} target="_blank" rel="noreferrer" className="text-primary underline break-all">
          {label}
        </a>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <span className={className}>{nodes}</span>;
}
