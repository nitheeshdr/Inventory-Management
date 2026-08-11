"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import type { SearchHit } from "@/app/api/search/route";
import { groupBy } from "@/lib/utils";

const QUICK_LINKS: SearchHit[] = [
  { group: "Go to", label: "Dashboard", detail: "Overview", href: "/" },
  { group: "Go to", label: "Stock", detail: "Live balances", href: "/stock" },
  { group: "Go to", label: "Outward challans", detail: "Job-work register", href: "/challans" },
  { group: "Go to", label: "New challan", detail: "Send goods out", href: "/challans/new" },
  { group: "Go to", label: "New return note", detail: "Receive goods back", href: "/grn/new" },
  { group: "Go to", label: "Job worker registration", detail: "Register vendors & stock locations", href: "/masters/job-workers" },
  { group: "Go to", label: "Aging & deadlines", detail: "1-year GST clock", href: "/reports/aging" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    // Short queries show the quick links instead, so there is nothing to fetch
    // and nothing to clear — `results` below ignores `hits` in that case.
    if (query.trim().length < 2) return;

    // Debounce, and drop responses that arrive after a newer keystroke.
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = (await res.json()) as { hits: SearchHit[] };
        if (id === requestId.current) setHits(data.hits);
      } catch {
        if (id === requestId.current) setHits([]);
      }
    }, 160);

    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  const results = query.trim().length < 2 ? QUICK_LINKS : hits;
  const grouped = [...groupBy(results, (hit) => hit.group)];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-[13px] text-fg-subtle transition-colors hover:border-border-strong"
      >
        <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="flex-1 truncate">Search challans, bills, items…</span>
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
          ⌘K
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search"
        shouldFilter={false}
        className="fixed inset-0 z-50"
      >
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
        <div className="animate-fade-up absolute left-1/2 top-[12vh] w-[min(36rem,92vw)] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 text-fg-subtle" strokeWidth={1.75} />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Challan no, invoice no, item code, party…"
              className="h-11 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
          </div>

          <Command.List className="scroll-thin max-h-[52vh] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-sm text-fg-muted">
              Nothing matched “{query}”.
            </Command.Empty>

            {grouped.map(([group, groupHits]) => (
              <Command.Group
                key={group}
                heading={
                  <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                    {group}
                  </span>
                }
                className="mb-1"
              >
                {groupHits.map((hit) => (
                  <Command.Item
                    key={`${hit.group}-${hit.href}-${hit.label}`}
                    value={`${hit.label} ${hit.detail} ${hit.href}`}
                    onSelect={() => go(hit.href)}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm text-fg data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent"
                  >
                    <span className="font-medium">{hit.label}</span>
                    <span className="truncate text-xs text-fg-muted">{hit.detail}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </div>
      </Command.Dialog>
    </>
  );
}
