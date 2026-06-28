import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Idempotency
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const cached = await redis.get<string>(`idempotent:confirm:${idempotencyKey}`);
    if (cached) return NextResponse.json(JSON.parse(cached));
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id } });

      if (!reservation) throw new Error("NOT_FOUND");
      if (reservation.status === "CONFIRMED") throw new Error("ALREADY_CONFIRMED");
      if (reservation.status === "RELEASED") throw new Error("RELEASED");
      if (new Date() > reservation.expiresAt) {
        // Auto-release expired reservation
        await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
        });
        await tx.stock.updateMany({
          where: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
          data: { reserved: { decrement: reservation.quantity } },
        });
        throw new Error("EXPIRED");
      }

      // Confirm: reserved stays decremented (stock permanently gone)
      return tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED" },
        include: { product: true, warehouse: true },
      });
    });

    const responseBody = {
      id: result.id,
      status: result.status,
      quantity: result.quantity,
      expiresAt: result.expiresAt,
      product: { id: result.product.id, name: result.product.name, price: result.product.price, imageUrl: result.product.imageUrl },
      warehouse: { id: result.warehouse.id, name: result.warehouse.name },
    };

    if (idempotencyKey) {
      await redis.set(`idempotent:confirm:${idempotencyKey}`, JSON.stringify(responseBody), { ex: 86400 });
    }

    return NextResponse.json(responseBody);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "NOT_FOUND") return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    if (message === "EXPIRED") return NextResponse.json({ error: "Reservation has expired" }, { status: 410 });
    if (message === "RELEASED") return NextResponse.json({ error: "Reservation already released" }, { status: 410 });
    if (message === "ALREADY_CONFIRMED") return NextResponse.json({ error: "Already confirmed" }, { status: 200 });
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}