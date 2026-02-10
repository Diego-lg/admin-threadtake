"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Store,
  Plus,
  Settings,
  ChevronDown,
  LayoutDashboard,
  Package,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createStore,
  switchStore,
  getUserStores,
} from "@/actions/store-manager";

interface StoreSwitcherProps {
  currentStoreId?: string;
}

export function StoreSwitcher({ currentStoreId }: StoreSwitcherProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [stores, setStores] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch stores on mount
  const fetchStores = async () => {
    if (!session?.user?.id) return;
    try {
      setIsLoading(true);
      const { stores: userStores } = await getUserStores();
      setStores(userStores);
    } catch (error) {
      console.error("Error fetching stores:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch
  if (!isLoading && stores.length === 0 && session?.user?.id) {
    fetchStores();
  }

  // Handle store switch
  const handleSwitchStore = async (storeId: string) => {
    try {
      const result = await switchStore(storeId);
      if (result.success) {
        router.push(`/${storeId}`);
        router.refresh();
      }
    } catch (error) {
      console.error("Error switching store:", error);
      alert("Failed to switch store");
    }
  };

  // Handle create store
  const handleCreateStore = async () => {
    if (!newStoreName.trim()) {
      alert("Store name is required");
      return;
    }

    setIsCreating(true);
    try {
      const store = await createStore(newStoreName);
      setNewStoreName("");
      setIsDialogOpen(false);
      await fetchStores();
      await handleSwitchStore(store.id);
    } catch (error: any) {
      console.error("Error creating store:", error);
      alert(error.message || "Failed to create store");
    } finally {
      setIsCreating(false);
    }
  };

  // Get current store name
  const currentStore = stores.find((s) => s.id === currentStoreId);

  if (!session?.user?.id) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-[200px] justify-start">
            <Store className="mr-2 h-4 w-4" />
            {currentStore?.name || "Select Store"}
            <ChevronDown className="ml-auto h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuItem
            onClick={() => currentStoreId && router.push(`/${currentStoreId}`)}
            disabled={!currentStoreId}
          >
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              currentStoreId && router.push(`/${currentStoreId}/products`)
            }
            disabled={!currentStoreId}
          >
            <Package className="mr-2 h-4 w-4" />
            Products
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              currentStoreId && router.push(`/${currentStoreId}/orders`)
            }
            disabled={!currentStoreId}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Orders
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              currentStoreId && router.push(`/${currentStoreId}/settings`)
            }
            disabled={!currentStoreId}
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {stores.map((store) => (
            <DropdownMenuItem
              key={store.id}
              onClick={() => handleSwitchStore(store.id)}
              className="flex flex-col items-start py-2"
            >
              <span className="font-medium">{store.name}</span>
              <span className="text-xs text-muted-foreground">
                {store._count?.products || 0} products
              </span>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Plus className="mr-2 h-4 w-4" />
                Create New Store
              </DropdownMenuItem>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Store</DialogTitle>
                <DialogDescription>
                  Enter a name for your new store. You can have up to 10 stores.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="Store name"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  disabled={isCreating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateStore();
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateStore} disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Store"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
