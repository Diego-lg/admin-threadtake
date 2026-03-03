import { format } from "date-fns";
import { UserRole, UserStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { UserColumn } from "./components/columns";
import { UserClient } from "./components/client";

const UsersPage = async () => {
  // Fetch users directly on the server for initial render
  // This is a global admin page for managing all users
  const users = await prismadb.user.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      maxSavedDesigns: true,
    },
  });

  // Fetch general settings to know the default limit
  const generalSettings = await prismadb.generalSetting.findFirst();
  const defaultLimit = generalSettings?.defaultMaxSavedDesigns ?? 10;

  const formattedUsers: UserColumn[] = users.map((item) => ({
    id: item.id,
    name: item.name ?? "N/A",
    email: item.email ?? "N/A",
    role: item.role,
    status: item.status,
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
    maxSavedDesigns: item.maxSavedDesigns,
    effectiveLimit: item.maxSavedDesigns ?? defaultLimit,
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
