const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function checkDatabaseEntities() {
  try {
    console.log("Checking available entities in the database...\n");

    // Check products
    const products = await prisma.product.findMany({
      select: { id: true, name: true },
      take: 5,
    });
    console.log("Available Products:");
    if (products.length === 0) {
      console.log("  No products found in database");
    } else {
      products.forEach((p) => console.log(`  - ${p.id}: ${p.name}`));
    }

    // Check colors
    const colors = await prisma.color.findMany({
      select: { id: true, name: true, value: true },
      take: 5,
    });
    console.log("\nAvailable Colors:");
    if (colors.length === 0) {
      console.log("  No colors found in database");
    } else {
      colors.forEach((c) => console.log(`  - ${c.id}: ${c.name} (${c.value})`));
    }

    // Check sizes
    const sizes = await prisma.size.findMany({
      select: { id: true, name: true, value: true },
      take: 5,
    });
    console.log("\nAvailable Sizes:");
    if (sizes.length === 0) {
      console.log("  No sizes found in database");
    } else {
      sizes.forEach((s) => console.log(`  - ${s.id}: ${s.name} (${s.value})`));
    }

    // Check stores
    const stores = await prisma.store.findMany({
      select: { id: true, name: true },
      take: 5,
    });
    console.log("\nAvailable Stores:");
    if (stores.length === 0) {
      console.log("  No stores found in database");
    } else {
      stores.forEach((s) => console.log(`  - ${s.id}: ${s.name}`));
    }
  } catch (error) {
    console.error("Error checking database:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabaseEntities();
