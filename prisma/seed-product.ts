import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STORE_ID = "48663853-92b8-4434-92d3-02bf06f0a5db";

async function main() {
  console.log("Seeding sample product for generator...");

  // Check if store exists
  const store = await prisma.store.findUnique({
    where: { id: STORE_ID },
  });

  if (!store) {
    console.log(`Store ${STORE_ID} not found. Please create a store first.`);
    return;
  }

  console.log(`Found store: ${store.name}`);

  // Check if colors and sizes exist, create defaults if not
  let color = await prisma.color.findFirst({
    where: { storeId: STORE_ID },
  });

  if (!color) {
    color = await prisma.color.create({
      data: {
        name: "White",
        value: "#ffffff",
        storeId: STORE_ID,
      },
    });
    console.log(`Created color: ${color.name}`);
  }

  let size = await prisma.size.findFirst({
    where: { storeId: STORE_ID },
  });

  if (!size) {
    size = await prisma.size.create({
      data: {
        name: "Medium",
        value: "M",
        storeId: STORE_ID,
      },
    });
    console.log(`Created size: ${size.name}`);
  }

  // Check if billboard exists, create default if not
  let billboard = await prisma.billboard.findFirst({
    where: { storeId: STORE_ID },
  });

  if (!billboard) {
    billboard = await prisma.billboard.create({
      data: {
        storeId: STORE_ID,
        label: "T-Shirts",
        imageUrl:
          "https://pub-167bcbb6797c48d686d7dacfba94f17f.r2.dev/billboard-placeholder.jpg",
      },
    });
    console.log(`Created billboard: ${billboard.label}`);
  }

  // Check if category exists, create default if not
  let category = await prisma.category.findFirst({
    where: { storeId: STORE_ID },
  });

  if (!category) {
    category = await prisma.category.create({
      data: {
        storeId: STORE_ID,
        billboardId: billboard.id,
        name: "T-Shirts",
      },
    });
    console.log(`Created category: ${category.name}`);
  }

  // Check if a product already exists
  const existingProduct = await prisma.product.findFirst({
    where: {
      storeId: STORE_ID,
      isArchived: false,
    },
  });

  if (existingProduct) {
    console.log(`Product already exists: ${existingProduct.name}`);
    console.log("No new product created.");
  } else {
    // Create a sample product for the generator
    const product = await prisma.product.create({
      data: {
        name: "Classic T-Shirt",
        price: 29.99,
        categoryId: category.id,
        colorId: color.id,
        sizeId: size.id,
        storeId: STORE_ID,
        isFeatured: true,
        isArchived: false,
        images: {
          create: [
            {
              url: "https://pub-167bcbb6797c48d686d7dacfba94f17f.r2.dev/tshirt-placeholder.jpg",
            },
          ],
        },
      },
    });
    console.log(`Created product: ${product.name} (ID: ${product.id})`);
  }

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error("Error seeding product:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
