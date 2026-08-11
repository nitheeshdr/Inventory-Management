"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/primitives";

export function PrintToolbar() {
  const router = useRouter();

  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back
      </Button>
      <p className="text-xs text-fg-muted">Preview — A4, portrait</p>
      <Button variant="primary" size="sm" onClick={() => window.print()}>
        <Printer className="h-3.5 w-3.5" strokeWidth={1.75} />
        Print
      </Button>
    </div>
  );
}
