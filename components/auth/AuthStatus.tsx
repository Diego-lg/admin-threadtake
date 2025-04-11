"use client";

import { User } from "next-auth"; // Import User type
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogIn, LogOut, UserPlus } from "lucide-react"; // Icons

// Define the expected shape of the user prop, including the id
interface AuthStatusProps {
  user: (User & { id: string }) | null | undefined; // Extend User type to include id
}

export const AuthStatus = ({ user }: AuthStatusProps) => {
  console.log("AuthStatus received user prop:", user); // <-- DEBUG LOG ADDED
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false }); // Sign out without immediate redirect
    router.push("/"); // Redirect to home page after sign out
    router.refresh(); // Refresh to ensure state is updated
  };

  if (!user) {
    return (
      <div className="flex items-center space-x-2">
        <Button variant="outline" onClick={() => router.push("/login")}>
          <LogIn className="mr-2 h-4 w-4" /> Login
        </Button>
        <Button onClick={() => router.push("/register")}>
          <UserPlus className="mr-2 h-4 w-4" /> Register
        </Button>
      </div>
    );
  }

  // User is logged in
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={user.image ?? undefined}
              alt={user.name ?? "User"}
            />
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Add links to profile, settings etc. here if needed */}
        {/* <DropdownMenuItem onClick={() => router.push('/profile')}>
          <UserIcon className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem> */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
