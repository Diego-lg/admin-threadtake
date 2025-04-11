import prismadb from "@/lib/prismadb";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Import from the correct location

import Navbar from "@/components/navBar";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { storeId: string };
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login"); // Redirect to NextAuth login page
  }

  // Fetch the specific store for validation
  const store = await prismadb.store.findFirst({
    where: {
      id: params.storeId, // Use params.storeId directly
      userId,
    },
  });

  if (!store) {
    redirect("/"); // Redirect if the specific store isn't found or doesn't belong to the user
  }

  // Fetch all stores for the user to pass to the Navbar/StoreSwitcher
  const stores = await prismadb.store.findMany({
    where: {
      userId,
    },
  });

  return (
    <>
      <Navbar stores={stores} /> {/* Pass stores to Navbar */}
      {children}
    </>
  );
}
