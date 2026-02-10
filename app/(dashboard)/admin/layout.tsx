import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

import Navbar from "@/components/navBar";

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <Navbar />
      <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
        {children}
      </main>
    </>
  );
};

export default AdminLayout;
