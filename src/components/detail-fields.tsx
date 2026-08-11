import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DetailGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </dl>
  );
}

export function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className={cn("mt-0.5 truncate text-sm text-fg", mono && "font-mono text-[13px]")}>
        {value || <span className="text-fg-subtle">—</span>}
      </dd>
    </div>
  );
}
