import { Schema, model, models, type Model, type Types } from "mongoose";
import { DOC_TYPES, type DocType } from "@/lib/constants";

/**
 * The append-only stock ledger. Every balance in the app is a `$group` over this
 * collection — there is deliberately no mutable `qtyOnHand` anywhere, because a
 * cached total is a total that eventually drifts from reality.
 *
 * Cancelling a document posts reversing rows rather than deleting the originals,
 * so history stays auditable.
 */
export interface StockMovementDoc {
  _id: Types.ObjectId;
  movementDate: Date;
  itemId: Types.ObjectId;
  locationId: Types.ObjectId;
  /** Signed: positive is into the location, negative is out of it. */
  qty: number;
  docType: DocType;
  docId: Types.ObjectId;
  docNo: string;
  docLineId?: Types.ObjectId;
  partyId?: Types.ObjectId;
  /** Set on reversal rows so cancellations are identifiable. */
  isReversal: boolean;
  remark?: string;
  createdAt: Date;
}

const stockMovementSchema = new Schema<StockMovementDoc>(
  {
    movementDate: { type: Date, required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    qty: { type: Number, required: true },
    docType: { type: String, enum: DOC_TYPES, required: true },
    docId: { type: Schema.Types.ObjectId, required: true },
    docNo: { type: String, default: "" },
    docLineId: { type: Schema.Types.ObjectId },
    partyId: { type: Schema.Types.ObjectId, ref: "Party" },
    isReversal: { type: Boolean, default: false },
    remark: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "stock_movements" },
);

stockMovementSchema.index({ itemId: 1, locationId: 1 });
stockMovementSchema.index({ docType: 1, docId: 1 });
stockMovementSchema.index({ movementDate: -1 });
stockMovementSchema.index({ locationId: 1, movementDate: -1 });

export const StockMovement: Model<StockMovementDoc> =
  models.StockMovement ?? model<StockMovementDoc>("StockMovement", stockMovementSchema);
