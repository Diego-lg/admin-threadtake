"use client";

import axios from "axios";
import { useState } from "react";
import { Edit, Trash, Eye, ExternalLink } from "lucide-react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertModal } from "@/components/modals/alert-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { StoreColumn } from "./types";

interface CellActionProps {
  data: StoreColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(data.name);
  const [loading, setLoading] = useState(false);

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/stores/${data.id}`);
      toast.success("Store deleted.");
      router.refresh();
    } catch (error: any) {
      toast.error(error.response?.data || "Failed to delete store.");
    } finally {
      setLoading(false);
      setOpenDeleteConfirm(false);
    }
  };

  const onSaveName = async () => {
    if (!editName.trim() || editName === data.name) {
      setIsEditModalOpen(false);
      return;
    }

    try {
      setLoading(true);
      await axios.patch(`/api/stores/${data.id}`, { name: editName });
      toast.success("Store updated.");
      router.refresh();
      setIsEditModalOpen(false);
    } catch (error: any) {
      toast.error(error.response?.data || "Failed to update store.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AlertModal
        isOpen={openDeleteConfirm}
        onClose={() => setOpenDeleteConfirm(false)}
        onConfirm={onDelete}
        loading={loading}
        title="Delete Store"
        description="Are you sure you want to delete this store? This action cannot be undone."
      />

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Store Name</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="col-span-3"
                disabled={loading}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={loading}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={onSaveName} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <Edit className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => router.push(`/${data.id}`)}
            disabled={loading}
          >
            <Eye className="mr-2 h-4 w-4" /> View Store
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/${data.id}/settings`)}
            disabled={loading}
          >
            <ExternalLink className="mr-2 h-4 w-4" /> Store Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsEditModalOpen(true)}
            disabled={loading}
          >
            <Edit className="mr-2 h-4 w-4" /> Edit Name
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setOpenDeleteConfirm(true)}
            disabled={loading}
            className="text-red-600 focus:text-red-700"
          >
            <Trash className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
