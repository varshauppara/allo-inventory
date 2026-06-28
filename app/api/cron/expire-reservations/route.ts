import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const expired = await prisma.reservation.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
  });

  for (const r of expired) {
    await prisma.$transaction([
      prisma.stock.updateMany({
        where: { productId: r.productId, warehouseId: r.warehouseId },
        data: { reserved: { decrement: r.quantity } },
      }),
      prisma.reservation.update({
        where: { id: r.id },
        data: { status: "RELEASED" },
      }),
    ]);
  }

  return NextResponse.json({ released: expired.length });
}