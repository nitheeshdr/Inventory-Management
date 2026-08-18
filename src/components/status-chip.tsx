import { Chip } from "@/components/ui/primitives";
import type { DocStatus, InvoiceStatus } from "@/lib/constants";

const DOC_TONE: Record<DocStatus, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  open: "accent",
  partially_returned: "warning",
  closed: "success",
  cancelled: "danger",
};

export const DOC_LABEL: Record<DocStatus, string> = {
  draft: "Draft",
  open: "Open",
  partially_returned: "Partial",
  closed: "Closed",
  cancelled: "Cancelled",
};

export function DocStatusChip({ status }: { status: DocStatus }) {
  return <Chip tone={DOC_TONE[status]}>{DOC_LABEL[status]}</Chip>;
}

const INVOICE_TONE: Record<InvoiceStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  verified: "info",
  flagged: "warning",
  approved: "success",
  cancelled: "danger",
};

export const INVOICE_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  verified: "Verified",
  flagged: "Flagged",
  approved: "Approved",
  cancelled: "Cancelled",
};

export function InvoiceStatusChip({ status }: { status: InvoiceStatus }) {
  return <Chip tone={INVOICE_TONE[status]}>{INVOICE_LABEL[status]}</Chip>;
}

/**
 * How close a challan is to the one-year GST deadline. The office cares about
 * this more than any other number on the screen.
 */
export function AgingChip({ daysOpen }: { daysOpen: number }) {
  const remaining = 365 - daysOpen;

  if (remaining < 0) {
    return <Chip tone="danger">Overdue {Math.abs(remaining)}d</Chip>;
  }
  if (remaining <= 65) {
    return <Chip tone="warning">{remaining}d left</Chip>;
  }
  return (
    <Chip tone="neutral">
      {daysOpen}d open
    </Chip>
  );
}
