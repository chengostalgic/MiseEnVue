"use client";

import { Trash2 } from "lucide-react";
import type { CollectionItem } from "@/lib/collection";

export default function CollectionPanel({
  items,
  onRemove,
}: {
  items: CollectionItem[];
  onRemove: (id: string) => void;
}) {
  const visible = items.filter((item) => item.kind !== "hidden");

  if (!visible.length) {
    return (
      <p className="text-sm text-neutral-500">
        Nothing saved yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {visible.map((item) => (
        <article key={item.id} className="rounded-xl border border-neutral-200 bg-white p-4 space-y-2 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#0047FF]">
                {item.kind}
                {item.creativity ? ` · ${item.creativity}` : ""}
              </div>
              <h3 className="text-sm font-medium text-neutral-950 mt-1">{item.title}</h3>
            </div>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="text-neutral-400 hover:text-rose-600"
              aria-label={`Remove ${item.title}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          {item.summary ? <p className="text-xs text-neutral-500 leading-relaxed">{item.summary}</p> : null}
          {item.source_url ? (
            <a
              href={item.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[#0047FF] hover:underline"
            >
              Open evidence
            </a>
          ) : null}
        </article>
      ))}
    </div>
  );
}
