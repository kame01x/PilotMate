"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CloudSun,
  ExternalLink,
  FileText,
  Loader2,
  LocateFixed,
  Map,
  MapPin,
  Plane,
  Radio,
  RefreshCw,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

const TEXT = "#0f2a5c";
const MUTED = "#55698f";
const BORDER = "#d6e3f6";
const CARD_SHADOW = "shadow-[0_2px_12px_rgba(31,80,170,0.07)]";
const CARD_SURFACE = "rounded-[14px] border bg-white/95";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.12em]";

interface WeatherStation {
  rawOb?: string;
  rawTAF?: string;
  reportTime?: string;
  icaoId?: string;
  name?: string;
  temp?: number;
  dewp?: number;
  wdir?: number | string;
  wspd?: number;
  visib?: number | string;
  altim?: number;
  fltCat?: string;
}

interface WeatherResponse {
  ok: boolean;
  error: string | null;
  fetched_at?: string;
  data?: {
    icao?: string;
    metar?: WeatherStation[] | null;
    taf?: WeatherStation[] | null;
    metar_unavailable?: string;
    taf_unavailable?: string;
    nearest_reporting_station?: {
      icao?: string;
      distance_km?: number;
      raw_metar?: string;
      obs_time?: string;
    };
    source?: string;
  };
}

interface NotamResponse {
  ok: boolean;
  error: string | null;
  fetched_at?: string;
  data?: {
    detected_country?: string;
    official_sources?: string[];
    results?: { title?: string; url?: string; content?: string }[];
    clearly_relevant?: boolean;
    query?: string;
  };
}

interface AirportDirectory {
  name?: string;
  country?: string;
  state?: string;
  elev?: number;
  freqs?: string;
  runways?: { id?: string; dimension?: string; surface?: string; alignment?: number }[];
}

interface AirportResponse {
  ok: boolean;
  error: string | null;
  fetched_at?: string;
  data?: {
    icao?: string;
    airport?: {
      name?: string;
      icao?: string;
      iata?: string;
      servedCity?: string;
      coordinates?: { latitude?: number; longitude?: number };
      country?: { name?: string };
    } | null;
    directory?: AirportDirectory | null;
    country?: string;
    official_sources?: string[];
    sources?: string[];
  };
}

export interface NearestAirportData {
  icao?: string;
  name?: string;
  country?: string;
  distance_km?: number;
  latitude?: number;
  longitude?: number;
  observed_at?: string;
  metar?: string;
  directory?: AirportDirectory | null;
  official_sources?: string[];
  source?: string;
}

interface ChartPortal {
  match: string[];
  country: string;
  ifr: string;
  vfr: string;
}

const CHART_PORTALS: ChartPortal[] = [
  {
    match: ["K"],
    country: "United States",
    ifr: "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/",
    vfr: "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/",
  },
  {
    match: ["EG", "EI"],
    country: "United Kingdom / Ireland",
    ifr: "https://www.aurora.nats.co.uk/htmlAIP/Publications/",
    vfr: "https://www.aurora.nats.co.uk/htmlAIP/Publications/",
  },
  {
    match: ["LF"],
    country: "France",
    ifr: "https://www.sia.aviation-civile.gouv.fr/",
    vfr: "https://www.sia.aviation-civile.gouv.fr/",
  },
  {
    match: ["LK"],
    country: "Czechia",
    ifr: "https://aim.rlp.cz/",
    vfr: "https://aim.rlp.cz/",
  },
  {
    match: ["ED"],
    country: "Germany",
    ifr: "https://aip.dfs.de/",
    vfr: "https://aip.dfs.de/",
  },
  {
    match: ["C"],
    country: "Canada",
    ifr: "https://www.navcanada.ca/en/aeronautical-information.aspx",
    vfr: "https://www.navcanada.ca/en/aeronautical-information.aspx",
  },
  {
    match: ["Y"],
    country: "Australia",
    ifr: "https://www.airservicesaustralia.com/aip/aip.asp",
    vfr: "https://www.airservicesaustralia.com/aip/aip.asp",
  },
  {
    match: ["NZ"],
    country: "New Zealand",
    ifr: "https://www.airways.co.nz/",
    vfr: "https://www.airways.co.nz/",
  },
  {
    match: ["LE"],
    country: "Spain",
    ifr: "https://www.enaire.es/",
    vfr: "https://www.enaire.es/",
  },
  {
    match: ["LI"],
    country: "Italy",
    ifr: "https://www.enav.it/",
    vfr: "https://www.enav.it/",
  },
];

const ICAO_RE = /^[A-Z0-9]{3,5}$/;

function sourceHref(source: string) {
  if (source.startsWith("http://") || source.startsWith("https://")) return source;
  return `https://${source}`;
}

function icaoList(departure: string, destination: string) {
  return [departure, destination]
    .map((value) => value.trim().toUpperCase())
    .filter((value, index, all) => ICAO_RE.test(value) && all.indexOf(value) === index);
}

function formatFetched(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chartPortal(icao: string) {
  const code = icao.toUpperCase();
  return CHART_PORTALS.find((portal) => portal.match.some((prefix) => code.startsWith(prefix)));
}

function weatherSummary(station: WeatherStation) {
  return [
    station.temp != null ? `${station.temp}°C` : null,
    station.wspd != null ? `${station.wdir ?? "VRB"} / ${station.wspd} kt` : null,
    station.visib != null ? `Vis ${station.visib}` : null,
    station.altim != null ? `QNH ${station.altim}` : null,
    station.fltCat ? station.fltCat : null,
  ].filter(Boolean);
}

function SectionCard({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${CARD_SURFACE} ${CARD_SHADOW} overflow-hidden ${className}`} style={{ borderColor: BORDER }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5" style={{ borderColor: "#eaf0fa" }}>
        <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: TEXT }}>
          <span className="text-[#1f6bf5]">{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed" style={{ borderColor: BORDER }}>
      <Loader2 className="h-5 w-5 animate-spin text-[#1f6bf5]" aria-hidden="true" />
      <p className="text-xs" style={{ color: MUTED }}>{label}</p>
    </div>
  );
}

function EmptyBlock({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center" style={{ borderColor: BORDER, background: "#f8fbff" }}>
      <span className="text-[#8ba9d6]">{icon}</span>
      <p className="mt-2 text-sm font-semibold" style={{ color: TEXT }}>{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed" style={{ color: MUTED }}>{body}</p>
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function SourceLine({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[10px] leading-relaxed" style={{ color: MUTED }}>{children}</p>;
}

function WeatherCard({
  icao,
  result,
  loading,
  onRefresh,
}: {
  icao: string;
  result?: WeatherResponse;
  loading: boolean;
  onRefresh: () => void;
}) {
  const metar = result?.data?.metar?.[0];
  const taf = result?.data?.taf?.[0];

  return (
    <SectionCard
      title={`Weather ${icao}`}
      icon={<CloudSun className="h-4 w-4" aria-hidden="true" />}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[11px] font-semibold text-[#1f6bf5] transition hover:bg-[#eef5ff] disabled:opacity-50"
          style={{ borderColor: BORDER }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Refresh
        </button>
      }
    >
      {loading && !result ? (
        <LoadingBlock label={`Loading METAR and TAF for ${icao}...`} />
      ) : result?.error ? (
        <ErrorBlock message={result.error} />
      ) : !result ? (
        <EmptyBlock title="Weather not loaded" body="Refresh to request the latest METAR and TAF from aviationweather.gov." icon={<CloudSun className="h-7 w-7" aria-hidden="true" />} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              {result.ok ? "Source reachable" : "Partial / unavailable"}
            </span>
            <span className="text-[10px]" style={{ color: MUTED }}>Fetched {formatFetched(result.fetched_at)}</span>
          </div>

          {metar ? (
            <div className="rounded-xl border p-3" style={{ borderColor: "#dbe7f8", background: "#f7faff" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`${EYEBROW} text-[#1857cf]`}>METAR</p>
                <p className="text-[10px]" style={{ color: MUTED }}>{metar.reportTime || ""}</p>
              </div>
              <p className="mt-2 break-words font-mono text-[12px] leading-relaxed" style={{ color: "#17305f" }}>{metar.rawOb}</p>
              {weatherSummary(metar).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {weatherSummary(metar).map((item) => (
                    <span key={item} className="rounded-md bg-white px-2 py-1 text-[10px]" style={{ color: MUTED }}>{item}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              {result.data?.metar_unavailable || `No METAR published for ${icao}.`}
            </p>
          )}

          {taf ? (
            <div className="rounded-xl border p-3" style={{ borderColor: "#dbe7f8", background: "#f7faff" }}>
              <p className={`${EYEBROW} text-[#1857cf]`}>TAF</p>
              <p className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed" style={{ color: "#17305f" }}>{taf.rawTAF}</p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-2.5 text-xs" style={{ borderColor: BORDER, color: MUTED }}>
              {result.data?.taf_unavailable || `No TAF published for ${icao}.`}
            </p>
          )}

          {result.data?.nearest_reporting_station && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800">
              Nearest reporting station: {result.data.nearest_reporting_station.icao} ({result.data.nearest_reporting_station.distance_km} km away). Conditions may differ.
            </p>
          )}
          <SourceLine>Source: aviationweather.gov. Verify the current official report before flight.</SourceLine>
        </div>
      )}
    </SectionCard>
  );
}

function NotamCard({
  icao,
  result,
  loading,
  onRefresh,
}: {
  icao: string;
  result?: NotamResponse;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <SectionCard
      title={`NOTAMs ${icao}`}
      icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
      action={
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[11px] font-semibold text-[#1f6bf5] transition hover:bg-[#eef5ff] disabled:opacity-50"
          style={{ borderColor: BORDER }}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Search
        </button>
      }
    >
      {loading && !result ? (
        <LoadingBlock label={`Searching official NOTAM sources for ${icao}...`} />
      ) : result?.error ? (
        <div className="flex flex-col gap-3">
          <ErrorBlock message={result.error} />
          {!!result.data?.official_sources?.length && (
            <div className="flex flex-wrap gap-2">
              {result.data.official_sources.map((source) => (
                <a key={source} href={sourceHref(source)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-[11px] font-medium text-[#1f6bf5]" style={{ borderColor: BORDER }}>
                  {source} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>
      ) : !result ? (
        <EmptyBlock title="NOTAMs not searched" body="Search the official AIS source for this airport before flight." icon={<ShieldAlert className="h-7 w-7" aria-hidden="true" />} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {result.ok ? "Search complete" : "Unavailable"}
            </span>
            <span className="text-[10px]" style={{ color: MUTED }}>
              {result.data?.detected_country || "Region unknown"} · Fetched {formatFetched(result.fetched_at)}
            </span>
          </div>

          {!!result.data?.official_sources?.length && (
            <div className="flex flex-wrap gap-2">
              {result.data.official_sources.map((source) => (
                <a key={source} href={sourceHref(source)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border bg-[#f5f9ff] px-2.5 py-1 text-[11px] font-medium text-[#1f6bf5]" style={{ borderColor: BORDER }}>
                  {source} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}

          {result.data?.clearly_relevant === false && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800">
              These web-search results may not be official or current. Verify every NOTAM in the national AIS source.
            </p>
          )}

          {result.data?.results && result.data.results.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {result.data.results.slice(0, 4).map((item, index) => (
                <li key={`${item.url}-${index}`} className="rounded-xl border p-3" style={{ borderColor: "#e3ebf7" }}>
                  <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-xs font-semibold text-[#1f6bf5] hover:underline">
                    {item.title || item.url} <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  </a>
                  {item.content && <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed" style={{ color: MUTED }}>{item.content}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs" style={{ color: MUTED }}>
              No clearly relevant results were returned. Open the official AIS source directly.
            </p>
          )}
          <SourceLine>Search results are not an official briefing. Always check the authoritative AIS/NOTAM source before flight.</SourceLine>
        </div>
      )}
    </SectionCard>
  );
}

export default function PreflightAviation({
  departure,
  destination,
  route,
  rules,
  nearest,
  locating,
  locationError,
  onSelectAirport,
  onUseLocation,
}: {
  departure: string;
  destination: string;
  route: string;
  rules: string;
  nearest: NearestAirportData | null;
  locating: boolean;
  locationError: string | null;
  onSelectAirport: (icao: string) => void;
  onUseLocation: () => void;
}) {
  const [manualIcao, setManualIcao] = useState(departure);
  const [weather, setWeather] = useState<Record<string, WeatherResponse>>({});
  const [notams, setNotams] = useState<Record<string, NotamResponse>>({});
  const [airport, setAirport] = useState<AirportResponse | null>(null);
  const [loadingWeather, setLoadingWeather] = useState<Record<string, boolean>>({});
  const [loadingNotams, setLoadingNotams] = useState<Record<string, boolean>>({});
  const [loadingAirport, setLoadingAirport] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const codes = useMemo(() => icaoList(departure, destination), [departure, destination]);
  const primary = codes[0] || "";
  const portal = chartPortal(primary);
  const destinationPortal = chartPortal(codes[1] || primary);
  const vfrPortal = destinationPortal || portal;

  useEffect(() => {
    setManualIcao(departure);
  }, [departure]);

  async function loadWeather(code: string) {
    setLoadingWeather((current) => ({ ...current, [code]: true }));
    try {
      const data = await apiFetch(`/student/preflight/weather/${encodeURIComponent(code)}`);
      setWeather((current) => ({ ...current, [code]: data }));
    } catch (error) {
      setWeather((current) => ({
        ...current,
        [code]: { ok: false, error: error instanceof Error ? error.message : "Weather lookup failed." },
      }));
    } finally {
      setLoadingWeather((current) => ({ ...current, [code]: false }));
    }
  }

  async function loadNotams(code: string) {
    setLoadingNotams((current) => ({ ...current, [code]: true }));
    try {
      const data = await apiFetch("/student/preflight/notams", {
        method: "POST",
        body: JSON.stringify({ icao: code }),
      });
      setNotams((current) => ({ ...current, [code]: data }));
    } catch (error) {
      setNotams((current) => ({
        ...current,
        [code]: { ok: false, error: error instanceof Error ? error.message : "NOTAM search failed." },
      }));
    } finally {
      setLoadingNotams((current) => ({ ...current, [code]: false }));
    }
  }

  async function loadAirport(code: string) {
    setLoadingAirport(true);
    setRequestError(null);
    try {
      const data = await apiFetch(`/student/preflight/airport/${encodeURIComponent(code)}`);
      setAirport(data);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Airport lookup failed.");
      setAirport(null);
    } finally {
      setLoadingAirport(false);
    }
  }

  useEffect(() => {
    if (!primary) {
      setAirport(null);
      return;
    }
    const timer = setTimeout(() => {
      void loadAirport(primary);
      codes.forEach((code) => {
        void loadWeather(code);
        void loadNotams(code);
      });
    }, 350);
    return () => clearTimeout(timer);
    // The airport codes are the request identity; helper functions are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary, destination]);

  function setManualAirport() {
    const code = manualIcao.trim().toUpperCase();
    if (!ICAO_RE.test(code)) {
      setManualError("Enter a valid ICAO code (3-5 letters or digits).");
      return;
    }
    setManualError(null);
    onSelectAirport(code);
  }

  const airportName = airport?.data?.airport?.name || airport?.data?.directory?.name || nearest?.name;
  const servedCity = airport?.data?.airport?.servedCity;
  const airportCountry = airport?.data?.airport?.country?.name || airport?.data?.country || nearest?.country;
  const officialSources = airport?.data?.official_sources || nearest?.official_sources || [];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className={`${CARD_SURFACE} ${CARD_SHADOW} overflow-hidden`} style={{ borderColor: BORDER }}>
            <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
              <div className="relative min-h-[180px] overflow-hidden bg-[linear-gradient(145deg,#dcecff_0%,#edf5ff_55%,#d8e9ff_100%)]">
                <svg aria-hidden="true" viewBox="0 0 220 190" className="absolute inset-0 h-full w-full">
                  <defs>
                    <pattern id="airport-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                      <path d="M32 0H0V32" fill="none" stroke="#9db9e6" strokeOpacity=".45" />
                    </pattern>
                  </defs>
                  <rect width="220" height="190" fill="url(#airport-grid)" />
                  <circle cx="110" cy="95" r="58" fill="none" stroke="#7fa2e0" strokeOpacity=".55" />
                  <circle cx="110" cy="95" r="38" fill="none" stroke="#7fa2e0" strokeOpacity=".55" strokeDasharray="3 6" />
                  <path d="M28 148C62 112 92 120 118 92c24-26 38-34 74-42" fill="none" stroke="#1f6bf5" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="110" cy="95" r="7" fill="#1f6bf5" />
                  <circle cx="110" cy="95" r="14" fill="none" stroke="#1f6bf5" strokeOpacity=".35" />
                </svg>
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-[#1f6bf5] shadow-sm">
                    <MapPin className="h-3 w-3" aria-hidden="true" />
                    {primary || "No airport selected"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col justify-center p-5">
                <p className={`${EYEBROW} text-[#1f6bf5]`}>Selected airport</p>
                {loadingAirport && !airport ? (
                  <div className="mt-2 flex items-center gap-2 text-sm" style={{ color: MUTED }}>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading airport record...
                  </div>
                ) : primary ? (
                  <>
                    <h2 className="mt-1 text-xl font-bold leading-tight" style={{ color: TEXT }}>
                      {airportName || primary}
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: MUTED }}>
                      {primary}
                      {servedCity ? ` · ${servedCity}` : ""}
                      {airportCountry ? ` · ${airportCountry}` : ""}
                    </p>
                    {nearest?.distance_km != null && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
                        <LocateFixed className="h-3.5 w-3.5 text-[#1f6bf5]" aria-hidden="true" />
                        {nearest.distance_km} km from your location
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(airport?.data?.directory?.runways || []).slice(0, 2).map((runway) => (
                        <span key={runway.id || runway.dimension} className="rounded-lg border bg-[#f8fbff] px-2.5 py-1 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
                          RWY {runway.id || "—"}{runway.dimension ? ` · ${runway.dimension}` : ""}
                        </span>
                      ))}
                      {airport?.data?.directory?.elev != null && (
                        <span className="rounded-lg border bg-[#f8fbff] px-2.5 py-1 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
                          Elev {airport.data.directory.elev} ft
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="mt-1 text-lg font-bold" style={{ color: TEXT }}>No airport selected</h2>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: MUTED }}>
                      Use your location or enter an ICAO code to load airport-specific weather, NOTAMs and chart sources.
                    </p>
                  </>
                )}
                {requestError && <p className="mt-2 text-xs text-rose-600">{requestError}</p>}
                {airport?.error && <p className="mt-2 text-xs text-amber-700">{airport.error}</p>}
              </div>
            </div>
          </section>

          <section className={`${CARD_SURFACE} ${CARD_SHADOW} px-4 py-3.5`} style={{ borderColor: BORDER }}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e3eeff] text-[#1f6bf5]">
                <Plane className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: TEXT }}>
                  {departure || "Departure not set"} {destination ? `→ ${destination}` : "· Local flight"}
                </p>
                <p className="truncate text-xs" style={{ color: MUTED }}>
                  {route || (destination ? "Route not entered" : "Local training area")} · {rules}
                </p>
              </div>
              <span className="rounded-full bg-[#eaf2ff] px-2.5 py-1 text-[10px] font-semibold text-[#1f6bf5]">
                Airport + route context
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: MUTED }}>
              Weather is checked for each coded airport. Airport NOTAM searches cover those airports; en-route areas and airspace still require an official AIS briefing.
            </p>
          </section>

          {codes.length === 0 ? (
            <EmptyBlock
              title="Set a departure airport"
              body="Enter an ICAO code in Flight Briefing or use your location to load real aviation data."
              icon={<MapPin className="h-8 w-8" aria-hidden="true" />}
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              {codes.map((code) => (
                <WeatherCard
                  key={`weather-${code}`}
                  icao={code}
                  result={weather[code]}
                  loading={Boolean(loadingWeather[code])}
                  onRefresh={() => void loadWeather(code)}
                />
              ))}
              {codes.map((code) => (
                <NotamCard
                  key={`notam-${code}`}
                  icao={code}
                  result={notams[code]}
                  loading={Boolean(loadingNotams[code])}
                  onRefresh={() => void loadNotams(code)}
                />
              ))}
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <SectionCard title="IFR charts" icon={<FileText className="h-4 w-4" aria-hidden="true" />}>
              <div className="flex flex-col gap-3">
                <div className="flex h-24 items-center justify-center rounded-xl border bg-[#f7faff]" style={{ borderColor: "#dbe7f8" }}>
                  <svg aria-hidden="true" viewBox="0 0 160 80" className="h-20 w-full max-w-[220px]">
                    <path d="M0 62h160M0 42h160M0 22h160M40 0v80M80 0v80M120 0v80" stroke="#b9cde9" strokeWidth="1" />
                    <path d="M12 64L38 22l33 31 28-39 23 30 18-13" fill="none" stroke="#1f6bf5" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="38" cy="22" r="3" fill="#1f6bf5" />
                    <circle cx="111" cy="44" r="3" fill="#0f2a5c" />
                  </svg>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                  {portal ? `Official ${portal.country} IFR chart publication.` : "Official national AIP/IFR chart publication."}
                </p>
                {portal ? (
                  <a href={portal.ifr} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1f6bf5] px-3 text-xs font-semibold text-white transition hover:bg-[#155bd8]">
                    Open official IFR source <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : officialSources.length > 0 ? (
                  <a href={sourceHref(officialSources[0])} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1f6bf5] px-3 text-xs font-semibold text-white transition hover:bg-[#155bd8]">
                    Open official AIS <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="rounded-lg border border-dashed p-2 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
                    No official chart source is configured for this region. Use your national AIP.
                  </p>
                )}
                <SourceLine>Chart links open official publishers only. No charts are generated or copied here.</SourceLine>
              </div>
            </SectionCard>

            <SectionCard title="VFR charts" icon={<Map className="h-4 w-4" aria-hidden="true" />}>
              <div className="flex flex-col gap-3">
                <div className="flex h-24 items-center justify-center rounded-xl border bg-[#f7faff]" style={{ borderColor: "#dbe7f8" }}>
                  <svg aria-hidden="true" viewBox="0 0 160 80" className="h-20 w-full max-w-[220px]">
                    <path d="M0 58h160M0 30h160M32 0v80M96 0v80M128 0v80" stroke="#b9cde9" strokeWidth="1" />
                    <path d="M8 68c26-6 40-32 65-26 22 5 36-22 79-30" fill="none" stroke="#1f6bf5" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" />
                    <path d="M42 12h18v10H42zM104 48h22v13h-22z" fill="#dbe9ff" stroke="#7fa2e0" />
                    <circle cx="84" cy="39" r="3" fill="#1f6bf5" />
                  </svg>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                  {destinationPortal?.country === portal?.country || !destination
                    ? "Official national VFR chart and AIP source."
                    : `Official ${destinationPortal?.country || "national"} VFR chart source for the destination region.`}
                </p>
                {vfrPortal ? (
                  <a href={vfrPortal.vfr} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1f6bf5] px-3 text-xs font-semibold text-white transition hover:bg-[#155bd8]">
                    Open official VFR source <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : officialSources.length > 0 ? (
                  <a href={sourceHref(officialSources[0])} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1f6bf5] px-3 text-xs font-semibold text-white transition hover:bg-[#155bd8]">
                    Open official AIS <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : (
                  <p className="rounded-lg border border-dashed p-2 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
                    No official chart source is configured for this region. Use your national AIP.
                  </p>
                )}
                <SourceLine>Always verify chart validity, edition and airspace status before flight.</SourceLine>
              </div>
            </SectionCard>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <SectionCard title="Your location" icon={<LocateFixed className="h-4 w-4" aria-hidden="true" />}>
            <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
              Use your current location once to find the nearest reporting airport. Precise coordinates are used for this lookup only and are not stored.
            </p>
            <button
              type="button"
              onClick={onUseLocation}
              disabled={locating}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1f6bf5] px-3 text-xs font-semibold text-white transition hover:bg-[#155bd8] disabled:opacity-60"
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="h-4 w-4" aria-hidden="true" />}
              {locating ? "Locating nearest airport..." : "Use My Location"}
            </button>
            {locationError && <p className="mt-2 text-[11px] leading-relaxed text-rose-600">{locationError}</p>}
            {nearest?.source && !locationError && (
              <p className="mt-2 text-[10px]" style={{ color: MUTED }}>
                Nearest airport source: {nearest.source}. {nearest.observed_at ? `Observation ${formatFetched(nearest.observed_at)}.` : ""}
              </p>
            )}
          </SectionCard>

          <SectionCard title="Change airport" icon={<MapPin className="h-4 w-4" aria-hidden="true" />}>
            <label htmlFor="preflight-airport-code" className="text-xs font-medium" style={{ color: MUTED }}>
              Airport ICAO
            </label>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setManualAirport();
              }}
            >
              <input
                id="preflight-airport-code"
                value={manualIcao}
                onChange={(event) => setManualIcao(event.target.value.toUpperCase())}
                placeholder="e.g. LKPR"
                maxLength={5}
                className="h-10 min-w-0 flex-1 rounded-lg border bg-white px-3 font-mono text-sm uppercase outline-none transition focus:border-[#1f6bf5]"
                style={{ borderColor: "#c9d9f1", color: TEXT }}
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg border bg-white px-3 text-xs font-semibold text-[#1f6bf5] transition hover:bg-[#eef5ff]"
                style={{ borderColor: BORDER }}
              >
                Set
              </button>
            </form>
            {manualError && <p className="mt-2 text-[11px] text-rose-600">{manualError}</p>}
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: MUTED }}>
              Manual selection is kept until you change it. Location lookup never overwrites a code you set yourself.
            </p>
          </SectionCard>

          <SectionCard title="Airport facts" icon={<Radio className="h-4 w-4" aria-hidden="true" />}>
            {primary ? (
              <div className="flex flex-col gap-2.5 text-xs" style={{ color: MUTED }}>
                <div className="flex justify-between gap-3">
                  <span>Airport</span>
                  <span className="text-right font-semibold" style={{ color: TEXT }}>{airportName || primary}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>ICAO</span>
                  <span className="font-mono font-semibold" style={{ color: TEXT }}>{primary}</span>
                </div>
                {airportCountry && (
                  <div className="flex justify-between gap-3">
                    <span>Country</span>
                    <span className="text-right font-semibold" style={{ color: TEXT }}>{airportCountry}</span>
                  </div>
                )}
                {airport?.data?.directory?.freqs && (
                  <div className="border-t pt-2.5" style={{ borderColor: "#eaf0fa" }}>
                    <p className={EYEBROW} style={{ color: MUTED }}>Frequencies</p>
                    <p className="mt-1 font-mono text-[11px] leading-relaxed" style={{ color: TEXT }}>{airport.data.directory.freqs}</p>
                  </div>
                )}
                {airport?.data?.sources && (
                  <p className="mt-1 text-[10px] leading-relaxed" style={{ color: MUTED }}>
                    Sources: {airport.data.sources.join(", ")}. Fetched {formatFetched(airport.fetched_at)}.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs leading-relaxed" style={{ color: MUTED }}>
                Select an airport to see its record, runway information and official sources.
              </p>
            )}
          </SectionCard>

        </aside>
      </div>
    </div>
  );
}
