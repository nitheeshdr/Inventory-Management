import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, EmptyState, PageHeader, TableWrap } from "@/components/ui/primitives";
import { connectDb } from "@/db/connect";
import { Grn, Party } from "@/db/models";
import { round3 } from "@/lib/format";
import { GrnListClient, type GrnListRow } from "./grn-list-client";

export const dynamic = "force-dynamic";

export default async function GrnPage() {
  await connectDb();

  const [notes, parties] = await Promise.all([
    Grn.find().sort({ grnDate: -1, createdAt: -1 }).lean(),
    Party.find().select("name").lean(),
  ]);

  const partyName = new Map(parties.map((p) => [p._id.toString(), p.name]));

  const rows: GrnListRow[] = notes.map((note) => ({
    _id: note._id.toString(),
    grnNo: note.grnNo,
    vendorDocNo: note.vendorDocNo ?? "",
    grnDate: note.grnDate.toISOString(),
    partyName: partyName.get(note.partyId.toString()) ?? "—",
    lineCount: note.lines.length,
    processed: round3(
      note.lines
        .filter((line) => line.lineKind === "processed")
        .reduce((total, line) => total + line.qty, 0),
    ),
    rejected: round3(
      note.lines
        .filter((line) => line.lineKind !== "processed")
        .reduce((total, line) => total + line.qty, 0),
    ),
    status: note.status === "cancelled" ? "cancelled" : "open",
  }));

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
        <GrnListClient rows={rows} />
      )}
    </>
  );
}
