import * as dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const delhi = await prisma.warehouse.create({
    data: { name: "Delhi Hub", location: "New Delhi, IN" },
  });
  const mumbai = await prisma.warehouse.create({
    data: { name: "Mumbai Hub", location: "Mumbai, IN" },
  });

  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Wireless Earbuds Pro",
        description: "Premium noise-cancelling earbuds with 30hr battery",
        price: 4999,
        imageUrl: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Mechanical Keyboard",
        description: "TKL layout, Cherry MX switches, RGB backlit",
        price: 7499,
        imageUrl: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "USB-C Hub 7-in-1",
        description: "4K HDMI, 100W PD, SD card, 3x USB-A",
        price: 2499,
        imageUrl: "https://images.unsplash.com/photo-1625895197185-efcec01cffe0?w=400",
      },
    }),
  ]);

  for (const product of products) {
    await prisma.stock.createMany({
      data: [
        { productId: product.id, warehouseId: delhi.id, total: 5, reserved: 0 },
        { productId: product.id, warehouseId: mumbai.id, total: 3, reserved: 0 },
      ],
    });
  }

  console.log("✅ Seeded successfully");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());