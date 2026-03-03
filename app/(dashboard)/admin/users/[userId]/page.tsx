import { format } from "date-fns";
import { UserRole, UserStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserOrdersList } from "../components/UserOrdersList";

const getInitials = (name?: string | null) => {
  if (!name) return "??";
  const names = name.split(" ");
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  return (names[0][0] + names[names.length - 1][0]).toUpperCase();
};

const UserDetailPage = async ({ params }: { params: { userId: string } }) => {
  const user = await prismadb.user.findUnique({
    where: {
      id: params.userId,
    },
    include: {
      _count: {
        select: {
          orders: true,
          savedDesigns: true,
        },
      },
      orders: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
          orderItems: {
            include: {
              product: {
                select: { name: true, price: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    return <div>User not found.</div>;
  }

  const formattedDate = (date: Date | null) =>
    date ? format(date, "MMMM do, yyyy, h:mm a") : "N/A";

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between">
          <Heading
            title="User Details"
            description={`Details for user ${user.name || user.email}`}
          />
        </div>
        <Separator />

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                User Profile
              </CardTitle>
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src={user.image ?? undefined}
                  alt={user.name ?? "User Avatar"}
                />
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-2xl font-bold">
                {user.name || "Unnamed User"}
              </div>
              <p className="text-xs text-muted-foreground">
                {user.email || "No Email"}
              </p>
              {user.bio && (
                <p className="text-sm text-muted-foreground pt-2">{user.bio}</p>
              )}
              {user.portfolioUrl && (
                <a
                  href={user.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline block pt-1"
                >
                  Portfolio Link
                </a>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Account Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Role:</span>
                <Badge
                  variant={
                    user.role === UserRole.ADMIN ? "default" : "secondary"
                  }
                >
                  {user.role}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge
                  variant={
                    user.status === UserStatus.ACTIVE
                      ? "default"
                      : "destructive"
                  }
                >
                  {user.status}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Email Verified:
                </span>
                <span>
                  {user.emailVerified
                    ? `Yes (${formattedDate(user.emailVerified)})`
                    : "No"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Is Creator:
                </span>
                <span>{user.isCreator ? "Yes" : "No"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Registered:
                </span>
                <span>{formattedDate(user.createdAt)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Last Updated:
                </span>
                <span>{formattedDate(user.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Total Orders:
                </span>
                <span className="font-semibold">{user._count.orders}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Saved Designs:
                </span>
                <span className="font-semibold">
                  {user._count.savedDesigns}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator />
        <UserOrdersList orders={user.orders} />
      </div>
    </div>
  );
};

export default UserDetailPage;
