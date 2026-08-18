import Link from "next/link";
import { Button, PageHeader } from "@/components/ui/primitives";
import { getItemStock, getLocations } from "@/lib/queries/stock";
import { StockTable } from "./stock-table";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const [rows, locations] = await Promise.all([getItemStock(), getLocations()]);
  const vendorLocations = locations.filter((l) => l.kind !== "plant");

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle="Live balances from the movement ledger — in the plant and lying with job workers."
        action={
          <>
            <Link href="/reports/stock-as-on">
              <Button variant="outline" size="sm">
                Stock as on date
              </Button>
            </Link>
            <Link href="/adjustments/new">
              <Button variant="primary" size="sm">
                New adjustment
              </Button>
            </Link>
          </>
        }
      />
      <StockTable rows={rows} locations={vendorLocations} />
    </>
  );
}
