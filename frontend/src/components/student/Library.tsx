"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Library() {
  const [general, setGeneral] = useState<any[]>([]);
  const [aircraftType, setAircraftType] = useState("Cessna 172");
  const [aircraftDocs, setAircraftDocs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/library/general").then(setGeneral).catch((e) => setError(e.message));
    loadAircraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAircraft() {
    try {
      const docs = await apiFetch(`/library/aircraft/${encodeURIComponent(aircraftType)}`);
      setAircraftDocs(docs);
    } catch (e: any) {
      setError(e.message);
    }
  }

  function DocCard({ d }: { d: any }) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">{d.title}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Type: {d.document_type}</p>
          <p>Source: {d.source}</p>
          <p>Reference: {d.file_reference}</p>
          <p className="mt-1 text-xs text-amber-800">{d.currency_notice}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <section>
        <h3 className="mb-2 font-medium">General reference</h3>
        <div className="grid gap-3 md:grid-cols-2">{general.map((d) => <DocCard key={d.id} d={d} />)}</div>
      </section>
      <section>
        <h3 className="mb-2 font-medium">By aircraft type</h3>
        <div className="mb-3 flex gap-2">
          <Input value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} className="max-w-xs" />
          <Button onClick={loadAircraft}>Browse</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{aircraftDocs.map((d) => <DocCard key={d.id} d={d} />)}</div>
      </section>
    </div>
  );
}
