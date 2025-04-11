import { format } from "date-fns";
import { UserRole, UserStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb"; // Direct DB access for initial load (alternative: fetch API)
import { UserColumn } from "./components/columns"; // Define this type next
import { UserClient } from "./components/client"; // Define this component next

// Decide on initial data loading strategy:
// 1. Server-side fetch (as done here): Good for initial load, SEO (though less relevant for admin).
// 2. Client-side fetch in UserClient: Simpler if complex filtering/pagination is handled entirely client-side after initial load.

const UsersPage = async ({ params }: { params: { storeId: string } }) => {
  // Fetch users directly on the server for initial render
  // Note: This bypasses the API route's auth check, assuming page access is already secured by middleware.
  // If API-level auth/logic is critical even for initial load, fetch from '/api/admin/users' instead.
  const users = await prismadb.user.findMany({
    // We might not need storeId here unless users are scoped to stores, which doesn't seem to be the case.
    // where: { storeId: params.storeId }, // Remove if users are global
    orderBy: {
      createdAt: "desc",
    },
    select: {
      // Select only necessary fields
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      // emailVerified: true, // Include if needed in the table
      // image: true, // Include if needed
    },
  });

  const formattedUsers: UserColumn[] = users.map((item) => ({
    id: item.id,
    name: item.name ?? "N/A", // Handle potential null names
    email: item.email ?? "N/A", // Handle potential null emails
    role: item.role,
    status: item.status,
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <UserClient data={formattedUsers} />
      </div>
    </div>
  );
};

export default UsersPage;
