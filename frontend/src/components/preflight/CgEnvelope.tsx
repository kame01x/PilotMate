"use client";

/**
 * CG envelope chart (Phase 21B) — rendered ONLY from the verified envelope
 * points stored in the aircraft's weight schedule (the backend sets
 * chart.included=false with a reason otherwise, and this component is not
 * rendered at all). X-axis: CG position, Y-axis: total mass (aviation
 * convention). The computed operating point is overlaid as a marker.
 */
import type { MBEnvelopePoint } from "@/lib/massBalance";

export default function CgEnvelope({
  envelope,
  cg,
  mass,
  massUnit,
  armUnit,
}: {
  envelope: MBEnvelopePoint[];
  cg: number;
  mass: number;
  massUnit: string;
  armUnit: string;
}) {
  if (envelope.length < 2) return null;
  const pts = [...envelope].sort((a, b) => a.mass - b.mass);

  const cgVals = pts.flatMap((p) => [p.min_cg, p.max_cg]);
  const massVals = pts.map((p) => p.mass);
  const padX = Math.max(0.02 * (Math.max(...cgVals) - Math.min(...cgVals)), 0.5);
  const padY = Math.max(0.05 * (Math.max(...massVals) - Math.min(...massVals)), 10);
  const x0 = Math.min(...cgVals, cg) - padX;
  const x1 = Math.max(...cgVals, cg) + padX;
  const y0 = Math.min(...massVals, mass) - padY;
  const y1 = Math.max(...massVals, mass) + padY;

  const W = 560;
  const H = 320;
  const M = { l: 62, r: 16, t: 14, b: 44 };
  const px = (v: number) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
  const py = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);

  // Envelope polygon: up the forward (min CG) limits, back down the aft limits.
  const forward = pts.map((p) => `${px(p.min_cg)},${py(p.mass)}`);
  const aft = [...pts].reverse().map((p) => `${px(p.max_cg)},${py(p.mass)}`);
  const polygon = [...forward, ...aft].join(" ");

  const markerInside =
    cg >= Math.min(...cgVals) && cg <= Math.max(...cgVals) &&
    mass >= Math.min(...massVals) && mass <= Math.max(...massVals);
  // Keep the marker label inside the plot area near the edges.
  const mx = px(cg);
  const my = py(mass);
  const labelRight = mx < W - M.r - 170;
  const labelBelow = my < M.t + 60;

  const ticks = (from: number, to: number, n: number) =>
    Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

  return (
    <figure className="rounded-md border border-border bg-card p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label="CG envelope: total mass versus centre of gravity">
        {/* gridlines + axis labels */}
        {ticks(y0, y1, 5).map((v, i) => (
          <g key={`y${i}`}>
            <line x1={M.l} x2={W - M.r} y1={py(v)} y2={py(v)} className="stroke-border" strokeWidth={1} />
            <text x={M.l - 8} y={py(v) + 4} textAnchor="end" className="fill-muted-foreground" fontSize={11}>
              {Math.round(v)}
            </text>
          </g>
        ))}
        {ticks(x0, x1, 5).map((v, i) => (
          <g key={`x${i}`}>
            <line x1={px(v)} x2={px(v)} y1={M.t} y2={H - M.b} className="stroke-border" strokeWidth={1} />
            <text x={px(v)} y={H - M.b + 16} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {/* envelope */}
        <polygon points={polygon} className="fill-primary/15 stroke-primary" strokeWidth={2} />
        {/* operating point */}
        <g>
          <circle cx={mx} cy={my} r={7}
                  className={markerInside ? "fill-success stroke-background" : "fill-destructive stroke-background"}
                  strokeWidth={2} />
          <text
            x={labelRight ? mx + 12 : mx - 12}
            y={labelBelow ? my + 22 : my - 14}
            textAnchor={labelRight ? "start" : "end"}
            className="fill-foreground" fontSize={12} fontWeight={600}
          >
            {mass.toFixed(1)} {massUnit} @ {cg.toFixed(2)} {armUnit}
          </text>
        </g>
        {/* axis titles */}
        <text x={(W + M.l - M.r) / 2} y={H - 6} textAnchor="middle" className="fill-foreground" fontSize={12}>
          Centre of gravity ({armUnit})
        </text>
        <text x={14} y={(H - M.b + M.t) / 2} textAnchor="middle" className="fill-foreground" fontSize={12}
              transform={`rotate(-90 14 ${(H - M.b + M.t) / 2})`}>
          Total mass ({massUnit})
        </text>
      </svg>
      <figcaption className="mt-1 text-[11px] text-muted-foreground">
        Envelope from the stored weight schedule — verify against the POH/AFM before flight.
      </figcaption>
    </figure>
  );
}
