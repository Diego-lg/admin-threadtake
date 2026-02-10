const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const ADMIN_USER_ID = "cmgn2iet90000l1049gofvpbk"; // diegoligarrido@gmail.com

  console.log("Creating store for admin user...");

  const store = await prisma.store.create({
    data: {
      id: "3e716dfa-5e67-47da-aa8d-1788014d7161", // Restore original ID
      name: "Wakamole",
      userId: ADMIN_USER_ID,
    },
  });

  console.log("Created store:", store);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
