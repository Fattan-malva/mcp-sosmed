"use client";

import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, Image as ImageIcon, Loader2, Save, Search, Trash2, RefreshCw, ShieldAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
interface Page { data: any; page?: { nextCursor: string | null; hasMore: boolean }; meta?: Row }
interface Session {
  configured: boolean;
  sessionId: string | null;
  csrfToken: string;
  dsUserId: string | null;
  updatedAt: string | null;
  cooldownSeconds: number;
  cooldownReason: string | null;
  endpointCooldowns: { endpoint: string; retryAfterSeconds: number; reason: string }[];
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan");
const withCursor = (base: string, cursor: string | null) =>
  cursor ? `${base}${base.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : base;
const enc = (s: string) => encodeURIComponent(s.trim());

function errorToast(e: unknown) {
  if (e instanceof ApiError && e.code === "IG_COOLDOWN") {
    toast.error("Instagram sedang membatasi akun. Tunggu sampai cooldown selesai.", { description: e.message });
  } else if (e instanceof ApiError && e.code === "IG_NOT_CONFIGURED") {
    toast.error("Cookie Instagram belum diisi. Buka tab Session.");
  } else {
    toast.error(errorText(e));
  }
}

/* ---------- Session (cookie form) ---------- */

function SessionPanel({ session, reload }: { session: Session | null; reload: () => void }) {
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/cookies/instagram", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cookies: draft }),
      });
      setDraft("");
      toast.success("Cookie Instagram disimpan di cookies.json");
      reload();
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/api/cookies/instagram", { method: "DELETE" });
      toast.success("Cookie Instagram dihapus");
      reload();
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Status session</CardTitle>
            <Badge variant={session?.configured ? "secondary" : "outline"}>
              {session?.configured ? "Terisi" : "Belum diisi"}
            </Badge>
          </div>
          <CardDescription>Cookie disimpan di data/cookies.json pada server. Nilai cookie tidak pernah ditampilkan.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Row label="sessionid" value={session?.sessionId ?? "—"} />
          <Row label="csrftoken" value={session?.csrfToken ?? "—"} />
          <Row label="ds_user_id" value={session?.dsUserId ?? "—"} />
          <Row label="Terakhir diubah" value={session?.updatedAt ? new Date(session.updatedAt).toLocaleString("id-ID") : "—"} />
          {session && session.cooldownSeconds > 0 && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-medium">Cooldown aktif: ~{Math.ceil(session.cooldownSeconds / 60)} menit lagi</p>
                <p className="text-muted-foreground">{session.cooldownReason}</p>
              </div>
            </div>
          )}
          {session?.endpointCooldowns.map((c) => (
            <p key={c.endpoint} className="text-muted-foreground text-xs">
              Endpoint <code className="font-mono">{c.endpoint}</code> diblokir ~{Math.ceil(c.retryAfterSeconds / 60)} menit
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Input cookie</CardTitle>
          <CardDescription>
            Wajib ada <code className="font-mono">sessionid</code>. Bisa berupa header <code className="font-mono">name=value; ...</code> atau JSON array
            hasil export browser. Gunakan akun sekunder.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="ig-cookie">Cookie</Label>
            <Textarea
              id="ig-cookie"
              rows={6}
              className="font-mono text-xs"
              placeholder="sessionid=...; csrftoken=...; ds_user_id=...; mid=..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !draft.trim()} onClick={save}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Simpan
            </Button>
            <Button variant="outline" onClick={reload} disabled={busy}>
              <RefreshCw className="size-4" /> Muat ulang status
            </Button>
            <Button variant="outline" disabled={busy || !session?.configured} onClick={remove}>
              <Trash2 className="size-4" /> Hapus
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-0">
      <span className="text-muted-foreground text-xs uppercase">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

/* ---------- Generic results ---------- */

function Results({ items }: { items: Row[] }) {
  if (!items.length) return <p className="text-muted-foreground py-8 text-center text-sm">Tidak ada data.</p>;
  return (
    <div className="grid gap-2">
      {items.map((item, i) => (
        <ItemCard key={`${item.pk ?? item.id ?? item.code ?? item.name ?? i}-${i}`} item={item} />
      ))}
    </div>
  );
}

function ItemCard({ item }: { item: Row }) {
  const thumb = item.image_versions2?.candidates?.[0]?.url ?? item.thumbnail_url ?? null;
  const user = item.user ?? (item.username ? item : null);

  if (item.username && !item.caption) {
    return (
      <div className="flex items-center gap-3 rounded-md border p-3">
        {item.profile_pic_url ? (
          <img src={item.profile_pic_url} alt="" className="size-10 rounded-full object-cover" />
        ) : (
          <div className="bg-muted size-10 rounded-full" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            @{item.username} {item.is_verified && <Badge variant="secondary" className="ml-1">verified</Badge>}
          </p>
          <p className="text-muted-foreground truncate text-xs">{item.full_name}</p>
        </div>
        {item.is_private && <Badge variant="outline">private</Badge>}
      </div>
    );
  }

  if (item.caption !== undefined || item.code || item.image_versions2) {
    return (
      <div className="flex gap-3 rounded-md border p-3">
        {thumb ? (
          <img src={thumb} alt="" className="size-16 shrink-0 rounded object-cover" />
        ) : (
          <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded">
            <ImageIcon className="text-muted-foreground size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-muted-foreground text-xs">@{user?.username ?? "—"} · ❤ {item.like_count ?? 0} · 💬 {item.comment_count ?? 0}</p>
          <p className="line-clamp-2 text-sm">{item.caption?.text ?? item.text ?? ""}</p>
          {item.code && (
            <a className="text-xs underline" href={`https://www.instagram.com/p/${item.code}/`} target="_blank" rel="noreferrer">
              Buka di Instagram
            </a>
          )}
        </div>
      </div>
    );
  }

  if (item.text !== undefined && item.user) {
    return (
      <div className="rounded-md border p-3 text-sm">
        <p className="text-muted-foreground text-xs">@{item.user.username} · ❤ {item.comment_like_count ?? 0}</p>
        <p>{item.text}</p>
      </div>
    );
  }

  if (item.name !== undefined && item.media_count !== undefined) {
    return (
      <div className="flex items-center justify-between rounded-md border p-3 text-sm">
        <span>#{item.name}</span>
        <span className="text-muted-foreground text-xs">{item.media_count} post</span>
      </div>
    );
  }

  const label = item.location?.name ?? item.name ?? item.title ?? item.text ?? null;
  return (
    <div className="rounded-md border p-3 text-sm">
      {label ? <p>{label}</p> : <pre className="text-muted-foreground overflow-x-auto text-xs">{JSON.stringify(item, null, 2)}</pre>}
    </div>
  );
}

/* ---------- Feed (hasil + muat lebih) ---------- */

interface Feed { items: Row[]; next: string | null; base: string; title: string; extra?: React.ReactNode }

function FeedView({ feed, onMore, busy }: { feed: Feed | null; onMore: () => void; busy: boolean }) {
  if (!feed) return <p className="text-muted-foreground py-8 text-center text-sm">Belum ada hasil.</p>;
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{feed.title}</p>
        <Badge variant="outline">{feed.items.length} item</Badge>
      </div>
      {feed.extra}
      <Results items={feed.items} />
      {feed.next && (
        <Button variant="outline" disabled={busy} onClick={onMore}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Muat lebih
        </Button>
      )}
    </div>
  );
}

/* ---------- Tabs ---------- */

function useFeed() {
  const [feed, setFeed] = React.useState<Feed | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = async (base: string, title: string, pick: (p: Page) => Row[] = (p) => p.data, extra?: React.ReactNode) => {
    setBusy(true);
    try {
      const p = await api<Page>(base);
      setFeed({ items: pick(p), next: p.page?.nextCursor ?? null, base, title, extra });
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  const more = async () => {
    if (!feed?.next) return;
    setBusy(true);
    try {
      const p = await api<Page>(withCursor(feed.base, feed.next));
      setFeed({ ...feed, items: [...feed.items, ...(p.data ?? [])], next: p.page?.nextCursor ?? null });
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  return { feed, busy, load, more, setFeed };
}

function RelasiTab() {
  const [username, setUsername] = React.useState("");
  const [profile, setProfile] = React.useState<Row | null>(null);
  const { feed, busy, load, more } = useFeed();
  const u = enc(username);
  const need = () => {
    if (!username.trim()) toast.error("Isi username dulu");
    return username.trim().length > 0;
  };

  const showProfile = async () => {
    if (!need()) return;
    try {
      const p = await api<Page>(`/api/instagram/users/${u}`);
      setProfile(p.data);
    } catch (e) {
      errorToast(e);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="username (tanpa @)" value={username} onChange={(e) => setUsername(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={showProfile}>Profil</Button>
          <Button disabled={busy} onClick={() => need() && load(`/api/instagram/users/${u}/followers?count=50`, `Followers @${username}`)}>Followers</Button>
          <Button variant="outline" disabled={busy} onClick={() => need() && load(`/api/instagram/users/${u}/following?count=50`, `Following @${username}`)}>Following</Button>
          <Button variant="outline" disabled={busy} onClick={() => need() && load(`/api/instagram/users/${u}/reels?count=12`, `Reels @${username}`)}>Reels</Button>
        </div>
      </div>
      {profile && <Results items={[profile]} />}
      <FeedView feed={feed} busy={busy} onMore={more} />
    </div>
  );
}

function PostTab() {
  const [post, setPost] = React.useState("");
  const [detail, setDetail] = React.useState<Row | null>(null);
  const { feed, busy, load, more } = useFeed();
  const p = enc(post);
  const need = () => {
    if (!post.trim()) toast.error("Isi ID, shortcode, atau URL post");
    return post.trim().length > 0;
  };

  const showDetail = async () => {
    if (!need()) return;
    try {
      const res = await api<Page>(`/api/instagram/posts/${encodeURIComponent(post.trim())}`);
      setDetail(res.data);
    } catch (e) {
      errorToast(e);
    }
  };

  const replies = async (commentPk: string) => {
    await load(
      `/api/instagram/posts/${encodeURIComponent(post.trim())}/comments/${commentPk}/replies?count=20`,
      `Balasan komentar ${commentPk}`,
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="URL, shortcode, atau media ID" value={post} onChange={(e) => setPost(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={showDetail}>Detail</Button>
          <Button disabled={busy} onClick={() => need() && load(`/api/instagram/posts/${p}/likes`, "Likes")}>Likes</Button>
          <Button variant="outline" disabled={busy} onClick={() => need() && load(`/api/instagram/posts/${p}/comments?count=20`, "Komentar")}>Komentar</Button>
        </div>
      </div>
      {detail && (
        <Card>
          <CardContent className="grid gap-2 pt-6 text-sm">
            <p className="text-muted-foreground text-xs">
              @{detail.user?.username ?? "—"} · ❤ {detail.like_count ?? 0} · 💬 {detail.comment_count ?? 0}
            </p>
            <p>{detail.caption?.text ?? "(tanpa caption)"}</p>
          </CardContent>
        </Card>
      )}
      <FeedView feed={feed} busy={busy} onMore={more} />
      {feed?.title === "Komentar" && (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs">Lihat balasan: masukkan pk komentar</p>
          <div className="flex gap-2">
            <ReplyLookup onLookup={replies} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReplyLookup({ onLookup }: { onLookup: (pk: string) => void }) {
  const [pk, setPk] = React.useState("");
  return (
    <>
      <Input placeholder="pk komentar" value={pk} onChange={(e) => setPk(e.target.value)} />
      <Button variant="outline" onClick={() => pk.trim() && onLookup(pk.trim())}>Balasan</Button>
    </>
  );
}

function SearchTab() {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState("top");
  const [result, setResult] = React.useState<Row | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    if (!q.trim()) return toast.error("Isi kata kunci");
    setBusy(true);
    try {
      const res = await api<Page>(`/api/instagram/search?q=${enc(q)}&type=${type}&count=30`);
      setResult(res.data);
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Input placeholder="Kata kunci" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {["top", "users", "reels", "hashtags", "music", "locations"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <Button disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Cari</Button>
      </form>
      {result && type === "top" ? (
        <div className="grid gap-4">
          <p className="text-sm font-medium">Akun</p>
          <Results items={result.users ?? []} />
          <p className="text-sm font-medium">Hashtag</p>
          <Results items={result.hashtags ?? []} />
          <p className="text-sm font-medium">Lokasi</p>
          <Results items={result.places ?? []} />
        </div>
      ) : (
        <Results items={Array.isArray(result) ? result : []} />
      )}
    </div>
  );
}

function HashtagTab() {
  const [tag, setTag] = React.useState("");
  const [tab, setTab] = React.useState("top");
  const [info, setInfo] = React.useState<Row | null>(null);
  const { feed, busy, load, more } = useFeed();
  const t = enc(tag);
  const need = () => {
    if (!tag.trim()) toast.error("Isi hashtag");
    return tag.trim().length > 0;
  };

  const showInfo = async () => {
    if (!need()) return;
    try {
      const res = await api<Page>(`/api/instagram/hashtags/${t}`);
      setInfo(res.data);
    } catch (e) {
      errorToast(e);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="hashtag (tanpa #)" value={tag} onChange={(e) => setTag(e.target.value)} />
        <select className="border-input bg-background h-9 rounded-md border px-3 text-sm" value={tab} onChange={(e) => setTab(e.target.value)}>
          <option value="top">top</option>
          <option value="recent">recent</option>
        </select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={showInfo}>Info</Button>
          <Button disabled={busy} onClick={() => need() && load(`/api/instagram/hashtags/${t}/posts?tab=${tab}&count=30`, `#${tag} (${tab})`)}>
            Postingan
          </Button>
        </div>
      </div>
      {info && (
        <Card>
          <CardContent className="pt-6 text-sm">#{info.name} · {info.media_count ?? 0} post</CardContent>
        </Card>
      )}
      <FeedView feed={feed} busy={busy} onMore={more} />
    </div>
  );
}

function LocationTab() {
  const [location, setLocation] = React.useState("");
  const [info, setInfo] = React.useState<Row | null>(null);
  const { feed, busy, load, more } = useFeed();
  const l = enc(location);
  const need = () => {
    if (!location.trim()) toast.error("Isi ID lokasi");
    return location.trim().length > 0;
  };

  const showInfo = async () => {
    if (!need()) return;
    try {
      const res = await api<Page>(`/api/instagram/locations/${l}`);
      setInfo(res.data);
    } catch (e) {
      errorToast(e);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder="ID lokasi (numerik)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={showInfo}>Info</Button>
          <Button disabled={busy} onClick={() => need() && load(`/api/instagram/locations/${l}/posts?count=30`, `Lokasi ${location}`)}>Postingan</Button>
        </div>
      </div>
      {info && <Results items={[info]} />}
      <FeedView feed={feed} busy={busy} onMore={more} />
    </div>
  );
}

function MetadataTab() {
  const [url, setUrl] = React.useState("https://www.instagram.com/");
  const [data, setData] = React.useState<Row | null>(null);
  const [busy, setBusy] = React.useState(false);

  const fetchMeta = async () => {
    setBusy(true);
    try {
      setData((await api<{ data: Row }>(`/api/instagram?url=${encodeURIComponent(url)}`)).data);
    } catch (e) {
      errorToast(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">URL Instagram</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              fetchMeta();
            }}
          >
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/..." />
            <Button disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Ambil metadata</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pratinjau</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <p className="text-muted-foreground py-12 text-center text-sm">Masukkan URL untuk melihat metadata.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
              {data.image ? <img src={data.image} alt="" className="aspect-square w-full rounded-md border object-cover" /> : <div className="bg-muted aspect-square rounded-md" />}
              <div className="space-y-2 text-sm">
                <p className="font-medium">{data.title || "—"}</p>
                <p>{data.description || "—"}</p>
                <a className="inline-flex items-center gap-1 text-xs underline" href={data.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3" /> Buka URL
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------- Page ---------- */

export default function InstagramPage() {
  const [session, setSession] = React.useState<Session | null>(null);

  const loadSession = React.useCallback(async () => {
    try {
      const res = await api<Session>("/api/instagram/session");
      setSession(res);
    } catch (e) {
      errorToast(e);
    }
  }, []);

  React.useEffect(() => {
    loadSession();
  }, [loadSession]);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Instagram</h1>
        <p className="text-muted-foreground text-sm">
          Relasi, post, pencarian, hashtag, dan lokasi. Semua request memakai cookie dari tab Session dan throttle serta cooldown server tetap aktif.
        </p>
      </div>

      <Tabs defaultValue="session" className="grid gap-4">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="session">Session</TabsTrigger>
          <TabsTrigger value="relasi">Relasi</TabsTrigger>
          <TabsTrigger value="post">Post</TabsTrigger>
          <TabsTrigger value="search">Pencarian</TabsTrigger>
          <TabsTrigger value="hashtag">Hashtag</TabsTrigger>
          <TabsTrigger value="lokasi">Lokasi</TabsTrigger>
          <TabsTrigger value="metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="session">
          <SessionPanel session={session} reload={loadSession} />
        </TabsContent>
        <TabsContent value="relasi"><RelasiTab /></TabsContent>
        <TabsContent value="post"><PostTab /></TabsContent>
        <TabsContent value="search"><SearchTab /></TabsContent>
        <TabsContent value="hashtag"><HashtagTab /></TabsContent>
        <TabsContent value="lokasi"><LocationTab /></TabsContent>
        <TabsContent value="metadata"><MetadataTab /></TabsContent>
      </Tabs>
    </div>
  );
}
