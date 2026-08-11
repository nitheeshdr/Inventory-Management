import { PageHeader } from "@/components/ui/primitives";
import { TabNav } from "@/components/shell/sidebar";

const TABS = [
  { href: "/reports/aging", label: "Aging & deadlines" },
  { href: "/reports/job-work-register", label: "Job-work register" },
  { href: "/reports/stock-as-on", label: "Stock as on date" },
  { href: "/reports/itc-04", label: "ITC-04 extract" },
];

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Everything below is computed from the movement ledger — no separate books to reconcile."
      />
      <TabNav tabs={TABS} />
      {children}
    </>
  );
}
