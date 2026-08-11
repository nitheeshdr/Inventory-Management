import { describe, expect, it } from "vitest";
import { fifoAllocate, validateAllocations, type PendingChallanLine } from "./allocation";

function line(
  overrides: Partial<PendingChallanLine> & { challanNo: string; pendingQty: number },
): PendingChallanLine {
  const { challanNo, pendingQty, ...rest } = overrides;

  return {
    challanId: `challan-${challanNo}`,
    challanNo,
    challanDate: "2026-08-05T00:00:00.000Z",
    dueDate: "2027-08-05T00:00:00.000Z",
    partyId: "party-1",
    challanLineId: `line-${challanNo}`,
    srNo: 1,
    itemId: "item-1",
    itemCode: "80078506",
    description: "MALMO 1200 ML INNER BOTTLE ASSEMBLY",
    uom: "PC",
    rate: 74.31,
    sentQty: pendingQty,
    returnedQty: 0,
    pendingQty,
    pendingValue: pendingQty * 74.31,
    daysOpen: 10,
    daysToDeadline: 355,
    isOverdue: false,
    ...rest,
  };
}

describe("fifoAllocate", () => {
  it("takes from the oldest challan first", () => {
    const candidates = [
      line({ challanNo: "NEW", challanDate: "2026-08-05T00:00:00.000Z", pendingQty: 100 }),
      line({ challanNo: "OLD", challanDate: "2026-02-01T00:00:00.000Z", pendingQty: 100 }),
    ];

    const { allocations, unallocated } = fifoAllocate(candidates, 60);

    expect(allocations).toEqual([
      { challanId: "challan-OLD", challanNo: "OLD", challanLineId: "line-OLD", qty: 60 },
    ]);
    expect(unallocated).toBe(0);
  });

  it("spills across challans when one is not enough", () => {
    const candidates = [
      line({ challanNo: "OLD", challanDate: "2026-02-01T00:00:00.000Z", pendingQty: 40 }),
      line({ challanNo: "NEW", challanDate: "2026-08-05T00:00:00.000Z", pendingQty: 100 }),
    ];

    const { allocations, unallocated } = fifoAllocate(candidates, 90);

    expect(allocations.map((a) => [a.challanNo, a.qty])).toEqual([
      ["OLD", 40],
      ["NEW", 50],
    ]);
    expect(unallocated).toBe(0);
  });

  it("reports what it could not place rather than over-allocating", () => {
    const candidates = [line({ challanNo: "ONE", pendingQty: 30 })];
    const { allocations, unallocated } = fifoAllocate(candidates, 50);

    expect(allocations).toHaveLength(1);
    expect(allocations[0].qty).toBe(30);
    expect(unallocated).toBe(20);
  });

  it("skips lines with nothing left", () => {
    const candidates = [
      line({ challanNo: "SETTLED", challanDate: "2026-01-01T00:00:00.000Z", pendingQty: 0 }),
      line({ challanNo: "OPEN", challanDate: "2026-06-01T00:00:00.000Z", pendingQty: 25 }),
    ];

    const { allocations } = fifoAllocate(candidates, 25);
    expect(allocations).toEqual([
      { challanId: "challan-OPEN", challanNo: "OPEN", challanLineId: "line-OPEN", qty: 25 },
    ]);
  });

  it("allocates nothing for a zero quantity", () => {
    const { allocations, unallocated } = fifoAllocate([line({ challanNo: "A", pendingQty: 10 })], 0);
    expect(allocations).toEqual([]);
    expect(unallocated).toBe(0);
  });
});

describe("validateAllocations", () => {
  const candidates = [
    line({ challanNo: "A", challanLineId: "line-a", pendingQty: 50 }),
    line({ challanNo: "B", challanLineId: "line-b", pendingQty: 20 }),
  ];

  it("passes when every line stays within what is pending", () => {
    const problems = validateAllocations(
      [
        { challanId: "challan-A", challanLineId: "line-a", qty: 50 },
        { challanId: "challan-B", challanLineId: "line-b", qty: 5 },
      ],
      candidates,
    );
    expect(problems).toEqual([]);
  });

  it("catches a single line returning more than was sent", () => {
    const problems = validateAllocations(
      [{ challanId: "challan-B", challanLineId: "line-b", qty: 21 }],
      candidates,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ challanNo: "B", allocated: 21, pending: 20, excess: 1 });
  });

  it("sums several allocations against the same challan line", () => {
    // Two form rows pointing at one challan line must not exceed it together.
    const problems = validateAllocations(
      [
        { challanId: "challan-A", challanLineId: "line-a", qty: 30 },
        { challanId: "challan-A", challanLineId: "line-a", qty: 25 },
      ],
      candidates,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0].allocated).toBe(55);
    expect(problems[0].excess).toBe(5);
  });

  it("flags an allocation against a line that is not pending at all", () => {
    const problems = validateAllocations(
      [{ challanId: "challan-Z", challanLineId: "line-z", qty: 5 }],
      candidates,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0].excess).toBe(5);
  });
});
