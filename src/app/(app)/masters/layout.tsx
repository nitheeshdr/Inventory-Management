import { PageHeader } from "@/components/ui/primitives";
import { TabNav } from "@/components/shell/sidebar";

const TABS = [
  { href: "/masters/job-workers", label: "Job workers" },
  { href: "/masters/items", label: "Items" },
  { href: "/masters/parties", label: "Customers & suppliers" },
  { href: "/masters/routes", label: "Process routes" },
  { href: "/masters/company", label: "Company" },
];

export default function MastersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader
        title="Masters"
        subtitle="The reference data every document and every stock balance is built from."
      />
      <TabNav tabs={TABS} />
      {children}
    </>
  );
}
