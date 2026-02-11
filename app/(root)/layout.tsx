import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    // If not logged in, children will handle redirect to login
    return <>{children}</>;
  }

  // Allow the store manager page to render
  return <>{children}</>;
}
