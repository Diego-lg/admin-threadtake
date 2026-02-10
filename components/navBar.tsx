"use client"; // Required for hooks like useSession

import { useSession } from "next-auth/react";
import Link from "next/link";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { ThemeToggle } from "./theme-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Bell, HelpCircle, Search, Store } from "lucide-react";

// No props needed for this version of the Navbar
// interface NavbarProps {}

const Navbar = (/* Props removed */) => {
  const { data: session } = useSession(); // Get session

  return (
    <div className="border-b bg-white dark:bg-black border-gray-200 dark:border-gray-700 sticky top-0 z-40">
      {/* Updated background and border for dark mode */}
      {/* Added sticky positioning */}
      <div className="flex h-16 items-center px-4 md:px-6">
        {/* Search Input */}
        <div className="relative flex-1 md:flex-grow-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[300px]"
          />
        </div>

        {/* Spacer */}
        <div className="flex-grow" />

        {/* Right side icons and user menu */}
        <div className="ml-auto flex items-center space-x-2 sm:space-x-4">
          {/* Back to Store Manager Link */}
          <Link
            href="/"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-muted"
          >
            <Store className="h-4 w-4" />
            <span className="hidden sm:inline">Stores</span>
          </Link>
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="rounded-full">
            <HelpCircle className="h-5 w-5" />
            <span className="sr-only">Help</span>
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Bell className="h-5 w-5" />
            <span className="sr-only">Notifications</span>
          </Button>
          {/* AuthStatus likely renders the user avatar/menu */}
          <AuthStatus user={session?.user} />
        </div>
      </div>
    </div>
  );
};

export default Navbar;
