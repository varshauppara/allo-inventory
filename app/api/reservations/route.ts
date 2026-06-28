
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

const ReserveSchema = z.object({
  productId: z.string(),
  warehouseId: z.string(),
  quantity: z.number().int().min(1),
});

const RESERVATION_TTL_MINUTES = 10;

export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const cached = await redis.get<string>(`idempotent:${idempotencyKey}`);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { status: 200 });
    }
  }

  const body = await req.json().catch(() => null);
  const parsed = ReserveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { productId, warehouseId, quantity } = parsed.data;

  
  try {
    // Use a Postgres transaction + SELECT FOR UPDATE as a second safety net
    const reservation = await prisma.$transaction(async (tx) => {
      // Lock the stock row at DB level too
      const stock = await tx.$queryRaw<
        { id: string; total: number; reserved: number }[]
      >`
        SELECT id, total, reserved
        FROM "Stock"
        WHERE "productId" = ${productId}
          AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (!stock.length) {
        throw new Error("STOCK_NOT_FOUND");
      }

      const { total, reserved } = stock[0];
      const available = total - reserved;

      if (available < quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      await tx.stock.updateMany({
        where: { productId, warehouseId },
        data: { reserved: { increment: quantity } },
      });

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);

      return tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt,
          idempotencyKey: idempotencyKey ?? undefined,
        },
        include: { product: true, warehouse: true },
      });
    });

    const responseBody = {
      id: reservation.id,
      status: reservation.status,
      quantity: reservation.quantity,
      expiresAt: reservation.expiresAt,
      product: {
        id: reservation.product.id,
        name: reservation.product.name,
        price: reservation.product.price,
        imageUrl: reservation.product.imageUrl,
      },
      warehouse: { id: reservation.warehouse.id, name: reservation.warehouse.name },
    };

    if (idempotencyKey) {
      await redis.set(`idempotent:${idempotencyKey}`, JSON.stringify(responseBody), { ex: 86400 });
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "Not enough stock available" }, { status: 409 });
    }
    if (message === "STOCK_NOT_FOUND") {
      return NextResponse.json({ error: "Product not found in this warehouse" }, { status: 404 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}