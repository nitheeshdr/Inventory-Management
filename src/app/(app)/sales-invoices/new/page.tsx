import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, EmptyState, PageHeader, Button } from "@/components/ui/primitives";
import { SalesInvoice } from "@/db/models";
import { getCompany, getItemOptions, getParties } from "@/lib/queries/masters";
import { nextDocNumber } from "@/lib/numbering";
import { SalesInvoiceForm } from "../sales-form";

export const dynamic = "force-dynamic";

export default async function NewSalesInvoicePage() {
  const company = await getCompany();
  const [items, customers, suggestedNo] = await Promise.all([
    getItemOptions(),
    getParties("customer"),
    nextDocNumber(SalesInvoice, "invoiceNo", company?.salesInvoicePrefix ?? "HH"),
  ]);

  return (
    <>
      <Link
        href="/sales-invoices"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to sales invoices
      </Link>
      <PageHeader
        title="New sales invoice"
        subtitle="The job-work bill — money only, no stock moves. Tax splits automatically by the customer's state code."
      />

      {customers.length === 0 ? (
        <Card>
          <EmptyState
            title="No customers yet"
            description="Add a customer in Masters before raising a sales invoice."
            action={
              <Link href="/masters/parties">
                <Button variant="primary" size="sm">
                  Go to parties
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <SalesInvoiceForm
          items={items}
          customers={customers}
          companyStateCode={company?.stateCode ?? "37"}
          suggestedNo={suggestedNo}
        />
      )}
    </>
  );
}
