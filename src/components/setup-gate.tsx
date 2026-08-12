import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import type { SetupState } from "@/lib/setup";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  detail: string;
  href: string;
  done: boolean;
}

function steps(state: SetupState): Step[] {
  return [
    {
      label: "Company details",
      detail: "Your name, GSTIN and factory address — these print on every document.",
      href: "/masters/company",
      done: state.hasCompany,
    },
    {
      label: "Item codes",
      detail: "The codes you receive from customers and the codes you return.",
      href: "/masters/items",
      done: state.hasItems,
    },
    {
      label: "Customers",
      detail: "The principals who send you goods. Each gets its own stock location.",
      href: "/masters/parties",
      done: state.hasCustomers,
    },
    {
      label: "Process routes",
      detail: "Which code you return for each code received, and the rate you charge.",
      href: "/masters/routes",
      done: state.hasItems && state.hasCustomers,
    },
    {
      label: "Opening stock",
      detail: "What is sitting in your factory right now, counted.",
      href: "/adjustments/new",
      done: false,
    },
  ];
}

/** Shown on the dashboard until there is enough master data to raise a challan. */
export function SetupChecklist({ state }: { state: SetupState }) {
  const list = steps(state);

  return (
    <Card className="mb-5">
      <CardHeader
        title="Set up your data"
        subtitle="Nothing is pre-filled — work down this list and the rest of the app comes alive."
      />
      <ol className="divide-y divide-border">
        {list.map((step, index) => (
          <li key={step.href} className="flex items-start gap-3 px-4 py-3">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                step.done
                  ? "bg-success-soft text-success"
                  : "border border-border text-fg-subtle",
              )}
            >
              {step.done ? (
                <Check className="h-3 w-3" strokeWidth={2.5} />
              ) : (
                index + 1
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.done ? "text-fg-muted line-through" : "text-fg",
                )}
              >
                {step.label}
              </p>
              <p className="text-xs text-fg-muted">{step.detail}</p>
            </div>
            <Link href={step.href} className="shrink-0">
              <Button variant={step.done ? "ghost" : "outline"} size="sm">
                {step.done ? "Review" : "Open"}
              </Button>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * Blocks a document entry screen when the masters it depends on are empty, and
 * says exactly what to add — better than a form that can only fail on save.
 */
export function SetupRequired({
  title,
  missing,
}: {
  title: string;
  missing: { label: string; href: string }[];
}) {
  return (
    <Card className="max-w-2xl">
      <CardHeader
        title={title}
        subtitle="Add the missing master data first, then come back to this screen."
      />
      <ul className="divide-y divide-border">
        {missing.map((item) => (
          <li key={item.href} className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-fg">
              <Circle className="h-3.5 w-3.5 text-fg-subtle" strokeWidth={1.75} />
              {item.label}
            </span>
            <Link href={item.href}>
              <Button variant="primary" size="sm">
                Add now
              </Button>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
