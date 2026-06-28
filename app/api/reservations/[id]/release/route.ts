import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });

      if (!reservation) throw new Error("NOT_FOUND");
      if (reservation.status === "RELEASED") throw new Error("ALREADY_RELEASED");
      if (reservation.status === "CONFIRMED") throw new Error("CONFIRMED");

      await tx.stock.updateMany({
        where: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
        data: { reserved: { decrement: reservation.quantity } },
      });

      return tx.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
      });
    });

    return NextResponse.json({ id: result.id, status: result.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    if (message === "ALREADY_RELEASED") return NextResponse.json({ id, status: "RELEASED" });
    if (message === "CONFIRMED") return NextResponse.json({ error: "Cannot release a confirmed reservation" }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}