"use client";

import axios from "axios";
import { useState } from "react";
import {
  MoreHorizontal,
  Edit,
  ToggleLeft,
  ToggleRight,
  Trash,
  Eye,
  Settings,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { UserRole, UserStatus } from "@prisma/client";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

import { UserColumn } from "./types";

interface CellActionProps {
  data: UserColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [isEditLimitModalOpen, setIsEditLimitModalOpen] = useState(false);
  const [currentLimitValue, setCurrentLimitValue] = useState<string | number>(
    data.maxSavedDesigns ?? "",
  );
  const [loading, setLoading] = useState(false);

  const isAdmin = data.role === UserRole.ADMIN;
  const isActive = data.status === UserStatus.ACTIVE;

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/admin/users/${data.id}`);
      toast.success("User deleted.");
      router.refresh();
    } catch (error: any) {
      const errorMsg =
        error.response?.data ||
        "Failed to delete user. Make sure you are not deleting your own account.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
      setOpenDeleteConfirm(false);
    }
  };

  const onChangeStatus = async () => {
    try {
      setLoading(true);
      const newStatus = isActive ? UserStatus.INACTIVE : UserStatus.ACTIVE;
      await axios.patch(`/api/admin/users/${data.id}`, { status: newStatus });
      toast.success(
        `User ${newStatus === UserStatus.ACTIVE ? "activated" : "deactivated"}.`,
      );
      router.refresh();
    } catch (error) {
      toast.error("Failed to update user status.");
    } finally {
      setLoading(false);
    }
  };

  const onEditRole = () => {
    toast("Role editing functionality not yet implemented.");
    console.log("Attempting to edit role for user:", data.id);
  };

  const onViewDetails = () => {
    router.push(`/admin/users/${data.id}`);
  };

  const onOpenEditLimitModal = () => {
    setCurrentLimitValue(
      data.maxSavedDesigns === null ? "" : data.maxSavedDesigns,
    );
    setIsEditLimitModalOpen(true);
  };

  const onSaveLimit = async () => {
    try {
      setLoading(true);
      const valueToSave =
        currentLimitValue === "" ? null : Number(currentLimitValue);

      if (
        valueToSave !== null &&
        (isNaN(valueToSave) ||
          valueToSave < 0 ||
          !Number.isInteger(valueToSave))
      ) {
        toast.error(
          "Invalid limit. Must be empty or a non-negative whole number.",
        );
        setLoading(false);
        return;
      }

      await axios.patch(`/api/users/${data.id}/settings`, {
        maxSavedDesigns: valueToSave,
      });

      toast.success("User design limit updated.");
      router.refresh();
      setIsEditLimitModalOpen(false);
    } catch (error: any) {
      const errorMsg = error.response?.data || "Failed to update design limit.";
      toast.error(errorMsg);
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
      />

      <Dialog
        open={isEditLimitModalOpen}
        onOpenChange={setIsEditLimitModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Design Limit for {data.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="limit" className="text-right">
                Max Designs
              </Label>
              <Input
                id="limit"
                type="number"
                min="0"
                step="1"
                placeholder="Leave blank for default"
                value={currentLimitValue}
                onChange={(e) => setCurrentLimitValue(e.target.value)}
                className="col-span-3"
                disabled={loading}
              />
            </div>
            <p className="text-xs text-muted-foreground px-1">
              Leave blank to use the global default limit ({data.effectiveLimit}{" "}
              currently applied).
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={loading}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={onSaveLimit} disabled={loading}>
              {loading ? "Saving..." : "Save Limit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={onViewDetails} disabled={loading}>
            <Eye className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenEditLimitModal} disabled={loading}>
            <Settings className="mr-2 h-4 w-4" /> Edit Design Limit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onEditRole} disabled={loading}>
            <Edit className="mr-2 h-4 w-4" /> Edit Role
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onChangeStatus} disabled={loading}>
            {isActive ? (
              <ToggleLeft className="mr-2 h-4 w-4" />
            ) : (
              <ToggleRight className="mr-2 h-4 w-4" />
            )}
            {isActive ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setOpenDeleteConfirm(true)}
            disabled={loading || isAdmin}
            className={`text-red-600 focus:text-red-700 ${
              isAdmin ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <Trash className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
