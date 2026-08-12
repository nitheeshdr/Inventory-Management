import Link from "next/link";
import { Plus } from "lucide-react";
import {
  Button,
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
import { DocStatusChip } from "@/components/status-chip";
import { connectDb } from "@/db/connect";
import { Grn, Party } from "@/db/models";
import { formatDate, formatQty, round3 } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function GrnPage() {
  await connectDb();

  const [notes, parties] = await Promise.all([
    Grn.find().sort({ grnDate: -1, createdAt: -1 }).lean(),
    Party.find().select("name").lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));

  return (
    <>
      <PageHeader
        title="Outward returns"
        subtitle="Goods returned to principals, allocated against the inward challans they arrived on."
        action={
          <Link href="/grn/new">
            <Button variant="primary" size="sm">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New return note
            </Button>
          </Link>
        }
      />

      {notes.length === 0 ? (
        <TableWrap>
          <EmptyState
            title="No return notes yet"
            description="Record one when you send processed goods back."
            action={
              <Link href="/grn/new">
                <Button variant="primary" size="sm">
                  New return note
                </Button>
              </Link>
            }
          />
        </TableWrap>
      ) : (
        <TableWrap className="max-h-[72vh] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>GRN no</Th>
                <Th>Vendor note</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <ThNum>Lines</ThNum>
                <ThNum>Processed</ThNum>
                <ThNum>Rejected</ThNum>
                <ThNum>Total qty</ThNum>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => {
                const processed = round3(
                  note.lines
                    .filter((line) => line.lineKind === "processed")
                    .reduce((total, line) => total + line.qty, 0),
                );
                const rejected = round3(
                  note.lines
                    .filter((line) => line.lineKind !== "processed")
                    .reduce((total, line) => total + line.qty, 0),
                );

                return (
                  <tr key={note._id.toString()} className="transition-colors hover:bg-surface-2">
                    <Td>
                      <Link
                        href={`/grn/${note._id.toString()}`}
                        className="font-mono text-[13px] text-accent hover:underline"
                      >
                        {note.grnNo}
                      </Link>
                    </Td>
                    <Td className="font-mono text-[13px] text-fg-muted">
                      {note.vendorDocNo ?? "—"}
                    </Td>
                    <Td className="whitespace-nowrap text-fg-muted">
                      {formatDate(note.grnDate)}
                    </Td>
                    <Td>{partyName.get(note.partyId.toString()) ?? "—"}</Td>
                    <TdNum className="text-fg-muted">{note.lines.length}</TdNum>
                    <TdNum className="text-success">{formatQty(processed)}</TdNum>
                    <TdNum className="text-warning">{formatQty(rejected)}</TdNum>
                    <TdNum className="font-medium">{formatQty(processed + rejected)}</TdNum>
                    <Td>
                      {note.status === "cancelled" ? (
                        <DocStatusChip status="cancelled" />
                      ) : (
                        <Chip tone="success">Despatched</Chip>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
