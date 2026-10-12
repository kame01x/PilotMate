"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DocItem {
  id: string;
  title: string;
  description: string;
  applicability?: string;
}

interface DocCategory {
  title: string;
  items: DocItem[];
}

interface AviationData {
  authorities: { code: string; name: string; country: string; type: string }[];
  aircraft: { model: string; manufacturer: string; engine: string; gear: string }[];
  documentation_categories: Record<string, DocCategory>;
  documentation_applicability: Record<string, Record<string, boolean>>;
}

export default function Library() {
  const [data, setData] = useState<AviationData | null>(null);
  const [general, setGeneral] = useState<any[]>([]);
  const [aircraftType, setAircraftType] = useState("");
  const [aircraftDocs, setAircraftDocs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/student/aviation-data"),
      apiFetch("/library/general"),
    ])
      .then(([avData, genDocs]) => {
        setData(avData);
        setGeneral(genDocs);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!aircraftType) return;
    apiFetch(`/library/aircraft/${encodeURIComponent(aircraftType)}`)
      .then(setAircraftDocs)
      .catch(() => setAircraftDocs([]));
  }, [aircraftType]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading documentation…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const categories = data?.documentation_categories || {};
  const applicability = data?.documentation_applicability || {};
  const aircraftApplicability = aircraftType ? applicability[aircraftType] || {} : {};

  function DocCard({ d, app }: { d: DocItem; app?: boolean }) {
    const isApplicable = app === undefined ? true : app;
    return (
      <Card className={!isApplicable ? "opacity-60" : ""}>
        <CardHeader>
          <CardTitle className="text-base">
            {d.title}
            {!isApplicable && <span className="ml-2 text-xs text-muted-foreground">(Not applicable)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{d.description}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 font-medium">Aircraft Selector</h3>
        <div className="mb-3 flex gap-2">
          <Select value={aircraftType} onValueChange={(v) => setAircraftType(v ?? "")}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="Select an aircraft…" />
            </SelectTrigger>
            <SelectContent>
              {(data?.aircraft || []).map((a) => (
                <SelectItem key={a.model} value={a.model}>
                  {a.model} ({a.manufacturer})
                </SelectItem>
              ))}
              <SelectItem value="other">Other / Not listed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {aircraftType && (
        <>
          {categories.aircraft_familiarization && (
            <section>
              <h3 className="mb-2 font-medium">{categories.aircraft_familiarization.title}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {categories.aircraft_familiarization.items.map((item) => (
                  <DocCard key={item.id} d={item} app={aircraftApplicability[item.id]} />
                ))}
              </div>
            </section>
          )}

          {categories.basic_handling && (
            <section>
              <h3 className="mb-2 font-medium">{categories.basic_handling.title}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {categories.basic_handling.items.map((item) => (
                  <DocCard key={item.id} d={item} app={aircraftApplicability[item.id]} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 font-medium">Aircraft Reference Documents</h3>
            {aircraftDocs.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {aircraftDocs.map((d) => (
                  <Card key={d.id}>
                    <CardHeader><CardTitle className="text-base">{d.title}</CardTitle></CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      <p>Type: {d.document_type}</p>
                      <p>Source: {d.source}</p>
                      <p>Reference: {d.file_reference}</p>
                      <p className="mt-1 text-xs text-caution">{d.currency_notice}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No reference documents found for {aircraftType}.</p>
            )}
          </section>
        </>
      )}

      <section>
        <h3 className="mb-2 font-medium">General Reference</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {general.map((d) => (
            <Card key={d.id}>
              <CardHeader><CardTitle className="text-base">{d.title}</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>Type: {d.document_type}</p>
                <p>Source: {d.source}</p>
                <p>Reference: {d.file_reference}</p>
                <p className="mt-1 text-xs text-caution">{d.currency_notice}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
