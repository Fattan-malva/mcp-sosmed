"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/health",
    desc: "Liveness probe.",
    params: [],
    example: "curl https://mcp-sosmed.mallvaa.xyz/health",
  },
  {
    method: "GET",
    path: "/api/jobs",
    desc: "LinkedIn guest job search. Returns id, title, company, location, postedAt, url.",
    params: [
      ["keywords", "string", "Free-text job keywords."],
      ["location", "string", "Location filter."],
      ["start", "number", "Pagination offset (default 0)."],
    ],
    example: "curl 'https://mcp-sosmed.mallvaa.xyz/api/jobs?keywords=engineer&location=Indonesia&start=0'",
  },
  {
    method: "GET",
    path: "/api/instagram",
    desc: "Open Graph metadata from a public Instagram URL.",
    params: [["url", "string", "instagram.com URL (required)."]],
    example: "curl 'https://mcp-sosmed.mallvaa.xyz/api/instagram?url=https://www.instagram.com/p/XXXX/'",
  },
] as const;

function Code({ text }: { text: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  };
  return (
    <div className="bg-muted flex items-start gap-2 rounded-md p-3">
      <pre className="flex-1 overflow-x-auto font-mono text-xs whitespace-pre-wrap">{text}</pre>
      <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={copy}><Copy className="size-3" /></Button>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Docs</h1>
        <p className="text-muted-foreground text-sm">Three public endpoints, no authentication.</p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="grid content-start gap-4 md:sticky md:top-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Base URL</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Code text="https://mcp-sosmed.mallvaa.xyz" />
              <p className="text-muted-foreground text-xs">CORS: <code className="font-mono">access-control-allow-origin: *</code>. Errors return <code className="font-mono">{`{ "error": "..." }`}</code> with status 502.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Responses</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><b>200</b> — payload wrapped as <code className="bg-muted rounded px-1 font-mono text-xs">{`{ "data": ... }`}</code> (except <code className="bg-muted rounded px-1 font-mono text-xs">/health</code>: <code className="bg-muted rounded px-1 font-mono text-xs">{`{ "ok": true }`}</code>)</p>
              <p><b>404</b> — unknown route</p>
              <p><b>502</b> — upstream (LinkedIn/Instagram) failed or blocked</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          {ENDPOINTS.map((e) => (
            <Card key={e.path}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="bg-secondary rounded px-1.5 py-0.5 font-mono text-[10px]">{e.method}</span>
                  <code className="font-mono text-sm">{e.path}</code>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{e.desc}</p>
                {e.params.length > 0 && (
                  <div className="overflow-hidden rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr><th className="px-2 py-1 text-left">Param</th><th className="px-2 py-1 text-left">Type</th><th className="px-2 py-1 text-left">Description</th></tr>
                      </thead>
                      <tbody>
                        {e.params.map(([name, type, desc]) => (
                          <tr key={name} className="border-t"><td className="px-2 py-1 font-mono">{name}</td><td className="text-muted-foreground px-2 py-1">{type}</td><td className="px-2 py-1">{desc}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Code text={e.example} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
