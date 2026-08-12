import Link from "next/link";
import { ArrowUpRight, Clock, Factory, Receipt, Truck } from "lucide-react";
import {
  Card,
  CardHeader,
  Chip,
  EmptyState,
  PageHeader,
  Table,
  TableWrap,
  Td,
  TdNum,
  Th,
  ThNum,
} from "@/components/ui/primitives";
import { AgingChip } from "@/components/status-chip";
import { SetupChecklist } from "@/components/setup-gate";
import { getDashboard } from "@/lib/queries/dashboard";
import { getSetupState } from "@/lib/setup";
import { formatAmount, formatDate, formatINR, formatINRShort, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DOC_HREF: Record<string, string> = {
  job_work_challan: "/challans",
  grn: "/grn",
  sales_invoice: "/sales-invoices",
  stock_adjustment: "/adjustments",
};

export default async function DashboardPage() {
  const [data, setup] = await Promise.all([getDashboard(), getSetupState()]);
  const maxBucketValue = Math.max(...data.aging.map((bucket) => bucket.value), 1);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          setup.isReady
            ? "What you are holding, and what needs to go back."
            : "Let's get your master data in first."
        }
      />

      {!setup.isReady && <SetupChecklist state={setup} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={<Factory className="h-4 w-4" strokeWidth={1.75} />}
          label="In our factory"
          value={`${formatQty(data.plantQty)} pcs`}
          detail={`Customer goods we are holding · ≈ ${formatINRShort(data.plantValue)} declared`}
          href="/stock"
        />
        <Tile
          icon={<Truck className="h-4 w-4" strokeWidth={1.75} />}
          label="Returned to customers"
          value={`${formatQty(data.offSiteQty)} pcs`}
          detail={`${formatINRShort(data.pendingValue)} still to return across ${data.openChallans} open challans`}
          href="/challans"
          tone="warning"
        />
        <Tile
          icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
          label="Nearing the 1-year deadline"
          value={`${data.overdueLines + data.nearDeadlineLines} lines`}
          detail={
            data.overdueLines > 0
              ? `${data.overdueLines} already overdue`
              : `${data.nearDeadlineLines} within 65 days`
          }
          href="/reports/aging"
          tone={data.overdueLines > 0 ? "danger" : "warning"}
        />
        <Tile
          icon={<Receipt className="h-4 w-4" strokeWidth={1.75} />}
          label="Supplier bills to verify"
          value={String(data.unverifiedBills)}
          detail="Job-work invoices not yet approved"
          href="/purchase-invoices"
        />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="How long we have held it"
            subtitle="Customer goods in our factory, by age of the inward challan."
          />
          <div className="space-y-2.5 p-4">
            {data.aging.every((bucket) => bucket.lines === 0) ? (
              <p className="py-6 text-center text-sm text-fg-muted">
                No customer goods are in the factory.
              </p>
            ) : (
              data.aging.map((bucket) => (
                <div key={bucket.key}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                    <span
                      className={cn(
                        "font-medium",
                        bucket.key === "overdue" ? "text-danger" : "text-fg",
                      )}
                    >
                      {bucket.label}
                    </span>
                    <span className="tnum text-fg-muted">
                      {formatQty(bucket.qty)} pcs · {formatINR(bucket.value)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        bucket.key === "overdue"
                          ? "bg-danger"
                          : bucket.key === "301-365"
                            ? "bg-warning"
                            : "bg-accent",
                      )}
                      style={{ width: `${Math.max((bucket.value / maxBucketValue) * 100, bucket.lines ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Held for each customer" />
          {data.heldPerCustomer.length === 0 ? (
            <EmptyState title="No customer goods on hand" />
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Customer</Th>
                    <ThNum>Pending qty</ThNum>
                    <ThNum>Value</ThNum>
                    <Th>Oldest</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.heldPerCustomer.map((vendor) => (
                    <tr key={vendor.partyId} className="hover:bg-surface-2">
                      <Td>{vendor.partyName}</Td>
                      <TdNum>{formatQty(vendor.qty)}</TdNum>
                      <TdNum>{formatAmount(vendor.value)}</TdNum>
                      <Td>
                        <AgingChip daysOpen={vendor.oldestDays} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Return these first"
            subtitle="Inward challan lines closest to the one-year GST deadline."
          />
          {data.urgent.length === 0 ? (
            <EmptyState title="Nothing pending" />
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Challan</Th>
                    <Th>Item</Th>
                    <ThNum>Pending</ThNum>
                    <Th>Deadline</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.urgent.map((line) => (
                    <tr key={line.challanLineId} className="hover:bg-surface-2">
                      <Td>
                        <Link
                          href={`/challans/${line.challanId}`}
                          className="font-mono text-[13px] text-accent hover:underline"
                        >
                          {line.challanNo}
                        </Link>
                      </Td>
                      <Td className="max-w-56 truncate">
                        <span className="font-mono text-[13px]">{line.itemCode}</span>
                        <span className="ml-1.5 text-xs text-fg-muted">{line.description}</span>
                      </Td>
                      <TdNum>{formatQty(line.pendingQty)}</TdNum>
                      <Td>
                        <AgingChip daysOpen={line.daysOpen} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent movements" />
          {data.recentMovements.length === 0 ? (
            <EmptyState title="No stock has moved yet" />
          ) : (
            <TableWrap className="rounded-none border-0">
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Item</Th>
                    <Th>Location</Th>
                    <ThNum>Qty</ThNum>
                    <Th>Document</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentMovements.map((movement) => (
                    <tr key={movement._id} className="hover:bg-surface-2">
                      <Td className="whitespace-nowrap text-fg-muted">
                        {formatDate(movement.date)}
                      </Td>
                      <Td className="font-mono text-[13px]">{movement.itemCode}</Td>
                      <Td className="max-w-40 truncate text-fg-muted">
                        {movement.locationName}
                      </Td>
                      <TdNum className={movement.qty < 0 ? "text-danger" : "text-success"}>
                        {movement.qty > 0 ? "+" : ""}
                        {formatQty(movement.qty)}
                      </TdNum>
                      <Td>
                        <Link
                          href={`${DOC_HREF[movement.docType] ?? "/"}/${movement.docId}`}
                          className="text-accent hover:underline"
                        >
                          {movement.docNo || movement.docTypeLabel}
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      {data.lowStock.length > 0 && (
        <Card className="mt-4">
          <CardHeader title="Below reorder level" subtitle="Plant balances only." />
          <TableWrap className="rounded-none border-0">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <ThNum>In plant</ThNum>
                  <ThNum>Reorder level</ThNum>
                  <Th>Short by</Th>
                </tr>
              </thead>
              <tbody>
                {data.lowStock.map((row) => (
                  <tr key={row.itemId} className="hover:bg-surface-2">
                    <Td>
                      <Link
                        href={`/stock/${row.itemId}`}
                        className="font-mono text-[13px] text-accent hover:underline"
                      >
                        {row.itemCode}
                      </Link>
                      <span className="ml-1.5 text-xs text-fg-muted">{row.description}</span>
                    </Td>
                    <TdNum>{formatQty(row.qty)}</TdNum>
                    <TdNum className="text-fg-muted">{formatQty(row.reorderLevel)}</TdNum>
                    <Td>
                      <Chip tone="warning">{formatQty(row.reorderLevel - row.qty)} pcs</Chip>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

function Tile({
  icon,
  label,
  value,
  detail,
  href,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  href: string;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full p-4 transition-colors hover:border-border-strong">
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              tone === "danger"
                ? "bg-danger-soft text-danger"
                : tone === "warning"
                  ? "bg-warning-soft text-warning"
                  : "bg-accent-soft text-accent",
            )}
          >
            {icon}
          </span>
          <ArrowUpRight
            className="h-3.5 w-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={1.75}
          />
        </div>
        <p className="mt-3 text-xs text-fg-muted">{label}</p>
        <p className="tnum mt-0.5 text-xl font-semibold text-fg">{value}</p>
        <p className="mt-1 text-[11px] leading-4 text-fg-subtle">{detail}</p>
      </Card>
    </Link>
  );
}
