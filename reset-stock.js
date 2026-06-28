const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.stock.updateMany({
    where: {
      productId: "cmqxm9jec0003hscqw2tb4be5",
      warehouseId: "cmqxm9j1k0000hscq2ut72x1y",
    },
    data: {
      total: 5,
      reserved: 4,
    },
  });
  console.log("Updated rows:", updated.count);
}

main().finally(() => prisma.$disconnect());