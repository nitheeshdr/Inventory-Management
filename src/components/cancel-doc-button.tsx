"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button, Input } from "@/components/ui/primitives";

/**
 * Cancelling posts reversing ledger rows, so it always asks for a reason —
 * that reason ends up on the reversal entries in the item ledger.
 */
export function CancelDocButton({
  action,
  label = "Cancel document",
  confirmTitle,
}: {
  action: (reason: string) => Promise<{ ok: true; data: void } | { ok: false; error: string }>;
  label?: string;
  confirmTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await action(reason.trim() || "No reason given");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Ban className="h-3.5 w-3.5" strokeWidth={1.75} />
        {label}
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-md border border-danger/30 bg-danger-soft p-3">
      <p className="text-sm font-medium text-danger">{confirmTitle}</p>
      <Input
        autoFocus
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (kept on the reversal entries)"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button variant="danger" size="sm" onClick={submit} disabled={pending}>
          {pending ? "Cancelling…" : "Confirm cancel"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
    </div>
  );
}
