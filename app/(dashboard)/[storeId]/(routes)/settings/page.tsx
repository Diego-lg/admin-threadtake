import prismadb from "@/lib/prismadb";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Import from the correct location
import { SettingsForm } from "./components/settings-form";

interface SettingsPageProps {
  params: Promise<{
    storeId: string;
  }>;
}

const SettingsPage: React.FC<SettingsPageProps> = async ({ params }) => {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login"); // Redirect to NextAuth login page
  }
  const { storeId } = await params;

  const store = await prismadb.store.findFirst({
    where: {
      id: storeId,
      userId,
    },
  });

  if (!store) {
    redirect("/");
  }

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <SettingsForm initialData={store} />
      </div>
    </div>
  );
};

export default SettingsPage;
