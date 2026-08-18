"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type { ItemOption } from "@/app/api/items/route";
import { cn } from "@/lib/utils";

/**
 * Type-to-search item picker for line grids. Kept keyboard-only on purpose:
 * data entry here is a typing job, so ↑/↓/Enter/Esc all work without the mouse.
 */
export function ItemCombobox({
  items,
  value,
  onSelect,
  placeholder = "Item code or name…",
  autoFocus,
  className,
}: {
  items: ItemOption[];
  value: ItemOption | null;
  onSelect: (item: ItemOption) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 40);
    return items
      .filter((item) => `${item.itemCode} ${item.description}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [items, query]);

  useEffect(() => {
    function onClickAway(event: MouseEvent) {
      const target = event.target as Node;
      // The dropdown itself lives in a portal (see below), so it's no longer a
      // DOM descendant of wrapRef — it needs its own containment check, or every
      // click on an option would look like a click-away and close the list
      // before the option's own onClick ever fires.
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  // The line-item tables this sits in are wrapped in a horizontally-scrolling
  // container. Per the CSS overflow spec, setting overflow-x alone forces
  // overflow-y to compute to "auto" too, so a dropdown positioned relative to
  // its trigger gets silently clipped to almost nothing. Rendering it through
  // a portal, positioned from the trigger's real screen coordinates, is what
  // actually escapes that clipping.
  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const trigger = wrapRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(448, window.innerWidth - 16);
      const left = Math.min(trigger.left, window.innerWidth - width - 8);
      setDropdownRect({ top: trigger.bottom + 4, left: Math.max(8, left), width });
    }
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function choose(item: ItemOption) {
    onSelect(item);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter" && open && matches[highlight]) {
      event.preventDefault();
      choose(matches[highlight]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="flex items-center gap-1 rounded-md border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <input
          value={open ? query : (value?.itemCode ?? "")}
          onChange={(event) => {
            setQuery(event.target.value);
            // Reset the cursor here rather than in an effect: a new search term
            // means the old highlighted row no longer exists.
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value ? value.itemCode : placeholder}
          autoFocus={autoFocus}
          className="h-8 w-full min-w-0 bg-transparent px-2 font-mono text-[13px] text-fg outline-none placeholder:font-sans placeholder:text-fg-subtle"
        />
        <ChevronDown className="mr-1.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" strokeWidth={1.75} />
      </div>

      {open &&
        dropdownRect &&
        createPortal(
          <ul
            ref={listRef}
            style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
            className="scroll-thin fixed z-50 max-h-64 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-xl"
          >
            {matches.length === 0 && (
              <li className="px-2.5 py-3 text-center text-xs text-fg-muted">
                No item matches “{query}”
              </li>
            )}
            {matches.map((item, index) => (
              <li key={item._id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]",
                    index === highlight ? "bg-accent-soft text-accent" : "text-fg",
                  )}
                >
                  <span className="w-20 shrink-0 font-mono">{item.itemCode}</span>
                  <span className="min-w-0 flex-1 truncate text-fg-muted">
                    {item.description}
                  </span>
                  {value?._id === item._id && <Check className="h-3.5 w-3.5" strokeWidth={2} />}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
