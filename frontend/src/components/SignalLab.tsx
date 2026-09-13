"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { LabPost, SignalLab } from "@/lib/signalLabTypes";
import { compactNumber } from "@/lib/format";

type Filter = "asks" | "shipped" | "dropped" | "all";

export default function SignalLab() {
  const [lab, setLab] = useState<SignalLab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("asks");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/lab")
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || "Lab failed");
        setLab(data.lab as SignalLab);
        const firstAsk = (data.lab as SignalLab).posts.find((post) => post.asks.length);
        setSelectedId(firstAsk?.id ?? data.lab.posts[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Lab failed"));
  }, []);

  const visible = useMemo(() => {
    const posts = lab?.posts ?? [];
    if (filter === "asks") return posts.filter((post) => post.asks.length);
    if (filter === "shipped") return posts.filter((post) => post.operatorDish);
    if (filter === "dropped") return posts.filter((post) => !post.operatorDish);
    return posts;
  }, [lab, filter]);

  const selected = visible.find((post) => post.id === selectedId) ?? visible[0] ?? null;

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!lab) return <p className="text-sm text-stone-500">Loading the raw pull…</p>;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-amber-200/80">Lab · you only</p>
        <h1 className="text-2xl text-stone-100">Raw pull → ask → what the kitchen would see</h1>
        <p className="text-sm text-stone-400 max-w-2xl leading-relaxed">
          This tab is not the product. It is the pipe. Comments that say “I want X” are
          the useful line. Discover only ships a dish when the scrape clustered it.
        </p>
        <p className="text-[11px] text-stone-600 truncate">Source {lab.rawPath || "no cached pull yet"}</p>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Videos" value={String(lab.videoCount)} />
        <Stat label="Comments" value={String(lab.commentCount)} />
        <Stat label="Asks" value={String(lab.askCount)} />
        <Stat label="Asks not shipped" value={String(lab.asksNotShipped)} />
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["asks", "Has an ask"],
            ["shipped", "Shipped to Discover"],
            ["dropped", "Never shown"],
            ["all", "Every video"],
          ] as Array<[Filter, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1.5 text-xs ${
              filter === id ? "bg-stone-100 text-stone-950" : "text-stone-400 hover:text-stone-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_1fr] gap-5">
        <aside className="rounded-2xl border border-stone-800 bg-[#141210] overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-800 text-[11px] uppercase tracking-wider text-stone-500">
            {visible.length} in this cut
          </div>
          <div className="max-h-[720px] overflow-y-auto">
            {visible.map((post) => {
              const active = selected?.id === post.id;
              return (
                <button
                  key={post.id || post.title}
                  type="button"
                  onClick={() => setSelectedId(post.id)}
                  className={`w-full text-left px-4 py-3 border-b border-stone-800/80 ${
                    active ? "bg-stone-100 text-stone-950" : "hover:bg-stone-900/60"
                  }`}
                >
                  <div className={`text-[11px] ${active ? "text-stone-500" : "text-amber-200/80"}`}>
                    {post.asks.length ? `${post.asks.length} ask${post.asks.length === 1 ? "" : "s"}` : "no ask"}
                    {post.operatorDish ? " · shipped" : " · not shipped"}
                  </div>
                  <div className={`mt-1 text-sm leading-snug ${active ? "text-stone-950" : "text-stone-100"}`}>
                    {post.title || "(untitled)"}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {selected ? <PostDetail post={selected} /> : (
          <p className="text-sm text-stone-500">Nothing in this cut.</p>
        )}
      </div>
    </div>
  );
}

function PostDetail({ post }: { post: LabPost }) {
  return (
    <section className="rounded-2xl border border-stone-800 bg-[#141210] p-5 space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-stone-500">{post.fate}</div>
        <h2 className="text-xl text-stone-50 mt-1">{post.title || "(untitled)"}</h2>
        <p className="text-xs text-stone-500 mt-2">
          {post.channel || "Unknown channel"} · {compactNumber(post.views)} views
          {post.query ? ` · query “${post.query}”` : ""}
        </p>
        {post.url ? (
          <a
            href={post.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-amber-200/90"
          >
            Open raw video <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-stone-800 bg-[#0c0b0a] p-4">
        <div className="text-[11px] uppercase tracking-wider text-stone-500">What Discover would show</div>
        {post.operatorDish ? (
          <p className="text-sm text-stone-200 mt-2">{post.operatorDish}</p>
        ) : (
          <p className="text-sm text-stone-500 mt-2">
            Nothing. This video never became a dish card.
          </p>
        )}
      </div>

      {post.asks.length ? (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-amber-200/80">Audience asks</div>
          {post.asks.map((ask) => (
            <article key={ask.ask} className="rounded-xl border border-amber-200/20 bg-amber-200/5 p-3">
              <div className="text-[11px] uppercase tracking-wider text-amber-200/80">{ask.kind}</div>
              <p className="text-sm text-stone-100 mt-1">“{ask.ask}”</p>
              <p className="text-xs text-stone-500 mt-2">{ask.comment}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-stone-500">No “I want X” line in the pulled comments.</p>
      )}

      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-wider text-stone-500">
          All comments ({post.comments.length})
        </div>
        {post.comments.length ? (
          <ul className="space-y-2">
            {post.comments.map((comment) => {
              const hit = post.asks.some((ask) => ask.comment === comment || comment.includes(ask.ask));
              return (
                <li
                  key={comment}
                  className={`text-sm leading-relaxed ${hit ? "text-amber-100" : "text-stone-400"}`}
                >
                  {comment}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-600">This row has no comments in the pull.</p>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800 bg-[#141210] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-lg text-stone-100 mt-1">{value}</div>
    </div>
  );
}
