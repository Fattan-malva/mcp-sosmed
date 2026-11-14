"use client";

import * as React from "react";
import { BriefcaseBusiness, Loader2, Search, ExternalLink, MapPin, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  postedAt: string | null;
  url: string;
}

export default function JobsPage() {
  const [keywords, setKeywords] = React.useState("software engineer");
  const [location, setLocation] = React.useState("Indonesia");
  const [start, setStart] = React.useState("0");
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  const search = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ keywords, location, start });
      const { data } = await api<{ data: Job[] }>(`/api/jobs?${params}`);
      setJobs(data);
      setSearched(true);
      if (data.length === 0) toast.info("No jobs matched that query.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">LinkedIn Jobs</h1>
        <p className="text-muted-foreground text-sm">Guest job search — no login, public postings only.</p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">Query</CardTitle></CardHeader>
          <CardContent>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                search();
              }}
            >
              <div className="grid gap-1.5">
                <Label htmlFor="kw">Keywords</Label>
                <Input id="kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="software engineer" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="loc">Location</Label>
                <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Indonesia" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="start">Start offset</Label>
                <Input id="start" type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Results {searched ? `(${jobs.length})` : ""}</CardTitle>
            <code className="text-muted-foreground font-mono text-xs">GET /api/jobs</code>
          </CardHeader>
          <CardContent className="space-y-2">
            {busy && <p className="text-muted-foreground py-6 text-center text-sm">Searching…</p>}
            {!busy && !searched && (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
                <BriefcaseBusiness className="size-8" />
                <p>Run a query to list public job postings.</p>
              </div>
            )}
            {!busy && searched && jobs.length === 0 && (
              <p className="text-muted-foreground py-10 text-center text-sm">No results.</p>
            )}
            {jobs.map((j) => (
              <div key={j.id} className="flex flex-wrap items-start gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{j.title || "Untitled"}</p>
                  <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1"><Building2 className="size-3" /> {j.company || "—"}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {j.location || "—"}</span>
                    {j.postedAt && <span className="font-mono">{j.postedAt.slice(0, 10)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">{j.id}</Badge>
                  {j.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={j.url} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3" /> Open
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
