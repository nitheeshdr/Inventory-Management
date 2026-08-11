"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * Approving a flagged bill is allowed but never accidental — the office has to
 * confirm they've seen the variance.
 */
export function ApproveButton({
  action,
  hasFlags,
}: {
  action: () => Promise<{ ok: true; data: void } | { ok: false; error: string }>;
  hasFlags: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (hasFlags && !confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
        Approve anyway
      </Button>
    );
  }

  if (hasFlags && confirming) {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-danger">{error}</span>}
        <span className="text-xs text-warning">Approve despite the variances?</span>
        <Button variant="primary" size="sm" onClick={run} disabled={pending}>
          {pending ? "Approving…" : "Yes, approve"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          No
        </Button>
      </div>
    );
  }

  return (
    <Button variant="primary" size="sm" onClick={run} disabled={pending}>
      <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
      {pending ? "Approving…" : "Approve for payment"}
    </Button>
  );
}
