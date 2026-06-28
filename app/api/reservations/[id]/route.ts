import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    include: { product: true, warehouse: true },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
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
    warehouse: {
      id: reservation.warehouse.id,
      name: reservation.warehouse.name,
    },
  });
}