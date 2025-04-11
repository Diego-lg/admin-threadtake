"use client"; // <-- Make Navbar a Client Component for debugging

import { useSession } from "next-auth/react"; // <-- Use client-side hook
import { AuthStatus } from "@/components/auth/AuthStatus";
import { MainNav } from "@/components/main-nav";
import StoreSwitcher from "@/components/store-switcher";
import { Store } from "@prisma/client"; // Import Store type
// Removed Clerk auth and redirect
// import prismadb from "@/lib/prismadb"; // <-- Cannot use prismadb directly in client component
import { ThemeToggle } from "./theme-toggle";

// Define props for Navbar
interface NavbarProps {
  stores: Store[];
}

const Navbar = ({ stores = [] }: NavbarProps) => {
  // Accept stores prop
  // <-- Remove async
  const { data: session, status } = useSession(); // <-- Get session using the hook
  console.log("Navbar Client Session Status:", status); // <-- DEBUG LOG
  console.log("Navbar Client Session Data:", session); // <-- DEBUG LOG
  //const _userId = session?.user?.id; // Prefixed as unused for now

  // Note: We might not need to redirect here. Access control should primarily be handled
  // by middleware or on specific pages needing authentication.
  // If a user needs to be logged in to see *any* navbar content, keep a check:
  // if (!userId) {
  //   redirect("/login"); // Redirect to NextAuth login page
  // }

  // Remove the temporary empty array, as stores are now passed via props
  // const stores: any[] = []; // Provide an empty array for now
  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4">
        <StoreSwitcher items={stores} /> {/* Pass the received stores prop */}
        <MainNav className="mx-6" /> {/* Uncommented */}
        <div className="ml-auto flex items-center space-x-4">
          <ThemeToggle /> {/* Uncommented */}
          <AuthStatus user={session?.user} />
        </div>{" "}
      </div>
    </div>
  );
}; // Removed async from function definition

export default Navbar;
