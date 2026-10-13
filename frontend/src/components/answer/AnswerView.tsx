"use client";

/**
 * ChatGPT-style answer layout (Phase 20): title + category, intro, section
 * cards with contextual icons, collapsible references, copy control, and a
 * concise plain mode for short factual answers. All content still flows
 * through the markdown renderer — nothing is trusted, nothing is invented.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Compass,
  Copy,
  Eye,
  GraduationCap,
  Info,
  Lightbulb,
  ListOrdered,
  Plane,
  PlayCircle,
  ShieldAlert,
  Sparkles,
  Target,
  Wrench,
} from "lucide-react";
import AnswerMarkdown from "@/components/answer/AnswerMarkdown";
import { countWords } from "@/lib/markdown";

/* --------------------------------------------------------------- heuristics */

interface Category {
  label: string;
  icon: ReactNode;
  match: RegExp;
}

const CATEGORIES: Category[] = [
  { label: "Flight Maneuvers", icon: <Plane className="h-3 w-3" aria-hidden="true" />, match: /\b(steep turn|standard[- ]rate|stall|slow flight|spiral|take[- ]?off|landing|crosswind|traffic pattern|maneuver|manoeuvr|go[- ]?around|ground reference|turns around|S[- ]turns?|rectangular course)\b/i },
  { label: "Aircraft Systems", icon: <Wrench className="h-3 w-3" aria-hidden="true" />, match: /\b(systems?|engine|electrical|hydraulic|fuel system|vacuum|pitot|avionics|propeller|carburetor|turbo)\b/i },
  { label: "Navigation", icon: <Compass className="h-3 w-3" aria-hidden="true" />, match: /\b(navigation|vor|ndb|ils|gnss|gps|radial|waypoint|dead reckoning|pilotage|flight plan|chart|sectional)\b/i },
  { label: "Weather", icon: <Cloud className="h-3 w-3" aria-hidden="true" />, match: /\b(weather|metar|taf|cloud|icing|turbulence|wind shear|visibility|pressure setting|convective|thunderstorm)\b/i },
  { label: "Exam Preparation", icon: <GraduationCap className="h-3 w-3" aria-hidden="true" />, match: /\b(easa|atpl| ppl theory|exam|theory question|multiple choice|correct answer|syllabus area|learning objective)\b/i },
];

function detectCategory(text: string): Category | null {
  for (const c of CATEGORIES) if (c.match.test(text)) return c;
  return null;
}

interface SectionIcon {
  icon: ReactNode;
  chip: string;
}

const SECTION_ICONS: { re: RegExp; icon: SectionIcon }[] = [
  { re: /(video|watch|demonstration|watch the)/i, icon: { icon: <PlayCircle className="h-4 w-4" aria-hidden="true" />, chip: "bg-primary/10 text-primary" } },
  { re: /(step[- ]by[- ]step|procedure|how to|checklist|steps|preparation|entry configuration)/i, icon: { icon: <ListOrdered className="h-4 w-4" aria-hidden="true" />, chip: "bg-primary/10 text-primary" } },
  { re: /(monitor|scan|attitude|instruments?|what to look)/i, icon: { icon: <Eye className="h-4 w-4" aria-hidden="true" />, chip: "bg-secondary/10 text-secondary" } },
  { re: /(common (errors?|mistakes?|pitfalls?)|errors?|mistakes?|incorrect)/i, icon: { icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />, chip: "bg-caution/10 text-caution" } },
  { re: /(tip|hint|technique)/i, icon: { icon: <Lightbulb className="h-4 w-4" aria-hidden="true" />, chip: "bg-caution/10 text-caution" } },
  { re: /(warning|safety|caution|limitation|consideration|risk)/i, icon: { icon: <ShieldAlert className="h-4 w-4" aria-hidden="true" />, chip: "bg-destructive/10 text-destructive" } },
  { re: /(reference|source|citation|further|document|library|regulation)/i, icon: { icon: <BookOpen className="h-4 w-4" aria-hidden="true" />, chip: "bg-muted text-muted-foreground" } },
  { re: /(takeaway|summary|key (points?|concepts?|learning)|recap)/i, icon: { icon: <Sparkles className="h-4 w-4" aria-hidden="true" />, chip: "bg-success/10 text-success" } },
  { re: /(purpose|objective|goal|why)/i, icon: { icon: <Target className="h-4 w-4" aria-hidden="true" />, chip: "bg-secondary/10 text-secondary" } },
  { re: /(overview|introduction|theory|background|what is|concept|explain)/i, icon: { icon: <Info className="h-4 w-4" aria-hidden="true" />, chip: "bg-muted text-muted-foreground" } },
];

function sectionIcon(heading: string | null): SectionIcon {
  if (!heading) return { icon: <Info className="h-4 w-4" aria-hidden="true" />, chip: "bg-muted text-muted-foreground" };
  for (const s of SECTION_ICONS) if (s.re.test(heading)) return s.icon;
  return { icon: <ChevronRight className="h-4 w-4" aria-hidden="true" />, chip: "bg-muted text-muted-foreground" };
}

const REFERENCE_RE = /(reference|source|citation|further reading|document|library|regulation)/i;
const SAFETY_CHECK_RE = /\b(poh\b|afm\b|syllabus|instructor|regulat)/i;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

interface AnswerSection {
  heading: string | null;
  body: string;
}

/** Split raw markdown into a title + sections on `##` boundaries. */
function splitAnswer(text: string): { title: string | null; intro: string; sections: AnswerSection[] } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let title: string | null = null;
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(HEADING_RE);
    if (h && h[1].length <= 2) {
      title = h[2].trim();
      start = i + 1;
      break;
    }
  }
  const introLines: string[] = [];
  const sections: AnswerSection[] = [];
  let current: AnswerSection | null = null;
  for (let i = start; i < lines.length; i++) {
    const h = lines[i].match(HEADING_RE);
    if (h && h[1].length === 2) {
      current = { heading: h[2].trim(), body: "" };
      sections.push(current);
      continue;
    }
    if (current) current.body += (current.body ? "\n" : "") + lines[i];
    else introLines.push(lines[i]);
  }
  const intro = introLines.join("\n").trim();
  const cleaned = sections.filter((s) => s.body.trim() || s.heading);
  return { title, intro, sections: cleaned };
}

/* -------------------------------------------------------------- copy button */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => { /* clipboard unavailable — ignore */ });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      title="Copy answer"
      aria-label="Copy answer"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* -------------------------------------------------------------------- entry */

export default function AnswerView({ text }: { text: string }) {
  const parsed = useMemo(() => {
    const content = (text ?? "").trim();
    if (!content) return null;
    const { title, intro, sections } = splitAnswer(content);
    const short = !title && sections.length === 0 && countWords(content) < 90;
    return { content, title, intro, sections, short };
  }, [text]);

  if (!parsed) return null;
  const { content, title, intro, sections, short } = parsed;

  // Short factual answers: plain markdown, no chrome (spec §4 type 5).
  if (short) {
    return <AnswerMarkdown text={content} baseHeadingLevel={3} />;
  }

  const category = detectCategory(title ?? content.slice(0, 240));
  const showSafetyNote =
    category?.label === "Flight Maneuvers" && !SAFETY_CHECK_RE.test(content);

  return (
    <div className="flex flex-col gap-3">
      {title && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {category && (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                {category.icon}
                {category.label}
              </span>
            )}
            <h3 className="text-[15px] leading-6 font-semibold text-foreground">{title}</h3>
          </div>
          <CopyButton text={content} />
        </div>
      )}

      {intro && <AnswerMarkdown text={intro} baseHeadingLevel={3} />}

      {sections.map((s, i) => {
        const ic = sectionIcon(s.heading);
        const isReference = s.heading ? REFERENCE_RE.test(s.heading) : false;
        const body = s.body.trim();

        if (isReference && body.split("\n").length > 6) {
          return (
            <details key={i} className="rounded-lg border border-border bg-card/40 px-3 py-2">
              <summary className="cursor-pointer list-none">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cnChip(ic.chip)}>{ic.icon}</span>
                  {s.heading}
                </span>
              </summary>
              <div className="mt-2">
                <AnswerMarkdown text={body} heading={s.heading} baseHeadingLevel={3} />
              </div>
            </details>
          );
        }

        return (
          <div key={i} className="rounded-lg border border-border bg-card/40 px-3 py-2.5">
            {s.heading && (
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className={cnChip(ic.chip)}>{ic.icon}</span>
                {s.heading}
              </h4>
            )}
            <AnswerMarkdown text={body} heading={s.heading} baseHeadingLevel={3} />
          </div>
        );
      })}

      {showSafetyNote && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Training guidance only — always follow your aircraft&apos;s POH/AFM, your approved syllabus, and your instructor.
        </p>
      )}
    </div>
  );
}

function cnChip(cls: string): string {
  return `inline-flex shrink-0 items-center justify-center rounded-md p-1 ${cls}`;
}
