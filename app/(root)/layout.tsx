import prismadb from "@/lib/prismadb";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Import from the correct location

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id; // Get userId from NextAuth session

  if (!userId) {
    redirect("/login"); // Redirect to NextAuth login page
  }
  const store = await prismadb.store.findFirst({
    where: { userId },
  });

  if (store) {
    redirect(`/${store.id}`);
  }

  return <>{children}</>;
}
