import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for every printed document: an A4 sheet with hairline rules,
 * forced black-on-white so a dark-theme screen still prints correctly.
 */
export function PrintSheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "print-sheet print-page mx-auto w-full bg-white p-6 text-[11px] leading-snug text-black shadow-sm print:shadow-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PrintTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="relative mb-2 text-center">
      <h1 className="text-[15px] font-bold uppercase tracking-wide underline">{title}</h1>
      {subtitle && <div className="mt-0.5 text-[10px]">{subtitle}</div>}
      {right && <div className="absolute right-0 top-0 text-[10px] font-semibold">{right}</div>}
    </div>
  );
}

/** Bordered key/value block, as on the original stationery. */
export function PrintBox({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("border border-black p-2", className)}>{children}</div>;
}

export function PrintRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-1">
      <span className="shrink-0 font-semibold">{label}</span>
      <span className="min-w-0 break-words">{value || "—"}</span>
    </div>
  );
}

export function PrintTable({ children }: { children: ReactNode }) {
  return (
    <table className="w-full table-fixed border-collapse border border-black">{children}</table>
  );
}

export function PTh({
  children,
  className,
  ...props
}: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border border-black px-1 py-0.5 text-center text-[10px] font-semibold",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function PTd({
  children,
  className,
  ...props
}: React.ComponentProps<"td">) {
  return (
    <td className={cn("border border-black px-1 py-0.5 align-top", className)} {...props}>
      {children}
    </td>
  );
}

export function PrintSignature({ label }: { label: string }) {
  return (
    <div className="mt-8 text-right text-[10px]">
      <div className="ml-auto w-48 border-t border-black pt-1">{label}</div>
    </div>
  );
}
