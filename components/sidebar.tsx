import Link from "next/link";
import { cn } from "@/lib/utils";
// Assuming you have an icon library like lucide-react installed
import {
  LayoutDashboard,
  ShoppingBag,
  Shirt,
  Shapes,
  Users,
  LineChart,
  Settings,
  ChevronLeft, // For the collapse icon
  Code, // Added Code icon for API link
  Store, // Added Store icon for Marketplace link
  Palette, // Using Palette icon for Generator Base
  Droplets, // Added Droplets icon for Colors
  Ruler, // Added Ruler icon for Sizes
  Cloud, // Added Cloud icon for R2 Manager
  Megaphone, // Added Megaphone icon for Billboards
} from "lucide-react";

interface SidebarProps {
  params: { storeId: string };
}

const Sidebar = ({ params }: SidebarProps) => {
  // Placeholder for sidebar state (e.g., collapsed/expanded)
  const isExpanded = true; // Default to expanded for now
  const storeId = params.storeId; // Extract storeId

  return (
    <div
      className={cn(
        "h-screen bg-white dark:bg-black text-black dark:text-white flex flex-col transition-all duration-300 ease-in-out sticky top-0", // Updated background and text
        isExpanded ? "w-64" : "w-20", // Adjust width based on state
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        {" "}
        {/* Updated border */}
        {isExpanded && (
          <h1 className="text-2xl font-bold">
            {/* Link the main logo back to the root or store dashboard */}
            <Link href={`/${storeId}`}>Admin Panel</Link>
          </h1>
        )}
        <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          {" "}
          {/* Updated hover */}
          {/* Toggle Icon */}
          <ChevronLeft
            className={cn(
              "h-6 w-6 transition-transform duration-300",
              !isExpanded && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-2 overflow-y-auto">
        {" "}
        {/* Added overflow-y-auto */}
        {/* Dashboard Link */}
        <Link
          href={`/${storeId}`} // Link to the main dashboard page for the store
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800" // Updated hover
        >
          <LayoutDashboard className="mr-3 h-5 w-5" />
          {isExpanded && <span>Dashboard</span>}
        </Link>
        {/* Orders Link */}
        <Link
          href={`/${storeId}/orders`} // Use storeId in href
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800" // Updated hover
        >
          <ShoppingBag className="mr-3 h-5 w-5" />
          {isExpanded && <span>Orders</span>}
        </Link>
        {/* Products Link */}
        <Link
          href={`/${storeId}/products`} // Use storeId in href
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800" // Updated hover
        >
          <Shirt className="mr-3 h-5 w-5" />
          {isExpanded && <span>Products</span>}
        </Link>
        {/* Generator Base Product Link */}
        <Link
          href={`/${storeId}/generator-base`} // Link to the new generator base page
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Palette className="mr-3 h-5 w-5" /> {/* Using Palette icon */}
          {isExpanded && <span>Generator Base</span>}
        </Link>
        {/* Billboards Link */}
        <Link
          href={`/${storeId}/billboards`} // Link to billboards page
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Megaphone className="mr-3 h-5 w-5" />
          {isExpanded && <span>Billboards</span>}
        </Link>
        {/* Product Options Link */}
        <Link
          href={`/${storeId}/product-options`} // Link to product options page (colors & sizes)
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Shapes className="mr-3 h-5 w-5" />{" "}
          {/* Using Shapes icon for combined options */}
          {isExpanded && <span>Product Options</span>}
        </Link>
        {/* Categories Link */}
        <Link
          href={`/${storeId}/categories`} // Use storeId in href
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800" // Updated hover
        >
          <Shapes className="mr-3 h-5 w-5" />
          {isExpanded && <span>Categories</span>}
        </Link>
        {/* Marketplace Link */}
        <Link
          href={`/${storeId}/marketplace-products`} // Link to marketplace products page
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Store className="mr-3 h-5 w-5" />
          {isExpanded && <span>Marketplace</span>}
        </Link>
        {/* Customers Link - Global Admin */}
        <Link
          href={`/admin/users`} // Global admin users page
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Users className="mr-3 h-5 w-5" />
          {isExpanded && <span>Customers</span>}
        </Link>
        {/* API Settings Link */}
        <Link
          href={`/${storeId}/api-settings`} // Updated href for API settings page
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800" // Updated hover
        >
          <Code className="mr-3 h-5 w-5" /> {/* Updated icon */}
          {isExpanded && <span>API</span>} {/* Updated text */}
        </Link>
        {/* R2 Storage Manager Link */}
        <Link
          href={`/${storeId}/r2-manager`} // Link to R2 storage manager
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Cloud className="mr-3 h-5 w-5" />
          {isExpanded && <span>R2 Storage</span>}
        </Link>
      </nav>

      {/* Footer */}
      <div className="mt-auto px-2 py-4 border-t border-gray-200 dark:border-gray-700">
        {" "}
        {/* Updated border */} {/* Pushed to bottom */}
        <Link
          href={`/${storeId}/settings`} // Use storeId in href
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800" // Updated hover
        >
          <Settings className="mr-3 h-5 w-5" />
          {isExpanded && <span>Settings</span>}
        </Link>
      </div>
    </div>
  );
};

export default Sidebar;
