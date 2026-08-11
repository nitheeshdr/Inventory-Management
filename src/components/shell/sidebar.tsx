"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Boxes,
  FileInput,
  FileOutput,
  LayoutDashboard,
  Package,
  Receipt,
  Settings2,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS: {
  label: string;
  items: { href: string; label: string; icon: typeof Boxes; exact?: boolean }[];
}[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/stock", label: "Stock", icon: Boxes },
    ],
  },
  {
    label: "Job work",
    items: [
      { href: "/challans", label: "Outward challans", icon: Truck },
      { href: "/grn", label: "Return notes", icon: FileInput },
      { href: "/purchase-invoices", label: "Job-work bills", icon: Receipt },
    ],
  },
  {
    label: "Sales",
    items: [{ href: "/sales-invoices", label: "Sales invoices", icon: FileOutput }],
  },
  {
    label: "Reports",
    items: [
      { href: "/reports/aging", label: "Aging & deadlines", icon: ArrowLeftRight },
      { href: "/reports/job-work-register", label: "Job-work register", icon: Package },
    ],
  },
  {
    label: "Setup",
    items: [{ href: "/masters/items", label: "Masters", icon: Settings2 }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6 px-3 py-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                      active
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Narrow screens get the same destinations as a scrollable strip. */
export function MobileNav() {
  const pathname = usePathname();
  const items = NAV_GROUPS.flatMap((group) => group.items);

  return (
    <div className="scroll-thin flex gap-1 overflow-x-auto lg:hidden">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Sub-navigation used by the masters and reports sections. */
export function TabNav({
  tabs,
}: {
  tabs: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
              active
                ? "border-accent font-medium text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
