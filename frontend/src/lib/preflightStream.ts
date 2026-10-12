"use client";

import { getToken, API_URL } from "@/lib/api";

export interface PreflightSource {
  name: string;
  url: string | null;
  fetched_at: string;
}

export type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets" | "numbered"; items: string[] }
  | { type: "kv"; rows: { label: string; value: string }[] }
  | { type: "code"; text: string }
  | { type: "warning"; text: string }
  | {
      type: "video";
      video_id: string;
      url: string;
      embed_url: string;
      thumbnail_url: string | null;
      title: string | null;
      channel: string | null;
      source: string;
      search_snippet?: string;
      preferred_source?: boolean;
    };

export interface BriefingSection {
  section_id: string;
  title: string;
  status: "ok" | "unavailable" | "failed";
  blocks: ContentBlock[];
  sources: PreflightSource[];
  error: string | null;
  notice: string | null;
}

export interface StreamEvent {
  type:
    | "generation_started"
    | "section_started"
    | "section_completed"
    | "section_unavailable"
    | "section_failed"
    | "generation_completed"
    | "generation_failed";
  generation_id: string;
  section_id?: string | null;
  section?: BriefingSection | null;
  status?: "complete" | "partial" | "failed" | null;
  error?: string | null;
  counts?: Record<string, number> | null;
}

export interface StreamHandlers {
  onEvent: (event: StreamEvent) => void;
  onError: (error: Error) => void;
}

/**
 * Consume the backend SSE stream (POST + fetch, not EventSource, because SSE
 * over POST needs custom headers). Returns an AbortController the caller can
 * use to cancel; also exposed so the UI can call the cancel endpoint.
 */
export function streamPreflight(payload: Record<string, unknown>, handlers: StreamHandlers): { abort: () => void; done: Promise<void> } {
  const controller = new AbortController();

  const done = (async () => {
    const token = getToken();
    let res: Response;
    try {
      res = await fetch(`${API_URL}/student/preflight/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user cancelled — not an error
      handlers.onError(new Error("Cannot reach the backend. Is it running?"));
      return;
    }
    if (!res.ok || !res.body) {
      let detail = `Pre-flight stream failed (HTTP ${res.status}).`;
      try {
        const data = (await res.json()) as { detail?: unknown };
        if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      } catch { /* keep default */ }
      handlers.onError(new Error(detail));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line
        let sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let eventName = "";
          let dataLine = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) eventName = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLine += line.slice(6);
          }
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine) as StreamEvent;
            if (!eventName) event.type = (eventName || event.type) as StreamEvent["type"];
            handlers.onEvent(event);
          } catch {
            // ignore malformed frame — never crash the UI on one bad line
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      handlers.onError(new Error(e instanceof Error ? e.message : "Stream interrupted."));
    }
  })();

  return {
    abort: () => controller.abort(),
    done,
  };
}

export async function cancelPreflight(generationId: string): Promise<boolean> {
  try {
    const token = getToken();
    const res = await fetch(`${API_URL}/student/preflight/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ generation_id: generationId }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.cancelled);
  } catch {
    return false;
  }
}
