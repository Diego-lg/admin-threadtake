"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Plus,
  Settings,
  Trash2,
  Package,
  ShoppingCart,
  Edit2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  deleteStore,
  getUserStores,
  createStore,
  switchStore,
} from "@/actions/store-manager";

interface StoreData {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    products: number;
    orders: number;
    categories: number;
    billboards: number;
  };
}

export default function StoresPage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchStores = async () => {
    try {
      const { stores: userStores } = await getUserStores();
      setStores(userStores);
    } catch (error) {
      console.error("Error fetching stores:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const handleCreateStore = async () => {
    if (!newStoreName.trim()) return;

    setIsCreating(true);
    try {
      const store = await createStore(newStoreName);
      setNewStoreName("");
      setIsDialogOpen(false);
      await fetchStores();
      await switchStore(store.id);
    } catch (error: any) {
      alert(error.message || "Failed to create store");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteStore = async (storeId: string) => {
    if (deleteConfirm !== storeId) {
      setDeleteConfirm(storeId);
      return;
    }

    try {
      await deleteStore(storeId);
      setDeleteConfirm(null);
      await fetchStores();
    } catch (error: any) {
      alert(error.message || "Failed to delete store");
    }
  };

  const handleSwitchStore = async (storeId: string) => {
    try {
      await switchStore(storeId);
      router.push(`/${storeId}`);
    } catch (error: any) {
      alert(error.message || "Failed to switch store");
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Stores</h1>
          <p className="text-muted-foreground mt-1">
            Manage your stores ({stores.length}/10)
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Store
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Store</DialogTitle>
              <DialogDescription>
                Enter a name for your new store.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="Store name"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                disabled={isCreating}
                onKeyDown={(e) => e.key === "Enter" && handleCreateStore()}
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
                {isCreating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {stores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              You don't have any stores yet.
            </p>
            <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
              Create your first store
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store) => (
            <Card key={store.id} className="relative">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  {store.name}
                </CardTitle>
                <CardDescription>
                  Created {new Date(store.createdAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    {store._count?.products || 0} products
                  </div>
                  <div className="flex items-center gap-1">
                    <ShoppingCart className="h-4 w-4" />
                    {store._count?.orders || 0} orders
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleSwitchStore(store.id)}
                  >
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Switch
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/${store.id}/settings`)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`${deleteConfirm === store.id ? "bg-red-100" : ""}`}
                    onClick={() => handleDeleteStore(store.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {deleteConfirm === store.id && (
                  <p className="text-xs text-red-500">
                    Click again to confirm deletion (this cannot be undone)
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
