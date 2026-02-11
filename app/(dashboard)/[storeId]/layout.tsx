import prismadb from "@/lib/prismadb";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Import from the correct location

export const dynamic = "force-dynamic";

import Navbar from "@/components/navBar";
import Sidebar from "@/components/sidebar"; // Import the new Sidebar

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

  // Removed the fetch for 'stores' as it's no longer needed by the updated Navbar

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-white dark:bg-black">
        {" "}
        {/* Updated background */} {/* Main flex container */}
        <Sidebar params={params} /> {/* Pass params to Sidebar */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          {" "}
          {/* Main content area */}
          <Navbar /> {/* Updated Navbar (no props needed) */}
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            {" "}
            {/* Page content */}
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
