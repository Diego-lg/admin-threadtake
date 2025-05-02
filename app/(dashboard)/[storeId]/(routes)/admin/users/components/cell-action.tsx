"use client";

import axios from "axios";
import { useState } from "react";
import {
  MoreHorizontal,
  Edit,
  ToggleLeft,
  ToggleRight,
  Trash,
  Eye, // Add Eye icon import
  Settings, // Icon for Edit Limit
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";
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
import { AlertModal } from "@/components/modals/alert-modal"; // Assuming you have a reusable alert modal
import { Input } from "@/components/ui/input"; // Import Input for the modal
import { Label } from "@/components/ui/label"; // Import Label for the modal
// Basic Modal Structure (Replace with your actual Modal component if available)
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

import { UserColumn } from "./columns"; // Import the type

interface CellActionProps {
  data: UserColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams(); // Contains storeId
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false); // State for delete alert modal
  const [isEditLimitModalOpen, setIsEditLimitModalOpen] = useState(false); // State for edit limit modal
  const [currentLimitValue, setCurrentLimitValue] = useState<string | number>(
    data.maxSavedDesigns ?? ""
  ); // State for limit input
  const [loading, setLoading] = useState(false);

  const isAdmin = data.role === UserRole.ADMIN;
  const isActive = data.status === UserStatus.ACTIVE;

  // --- Delete Handler ---
  const onDelete = async () => {
    // ... (keep existing delete logic)
    try {
      setLoading(true);
      await axios.delete(`/api/admin/users/${data.id}`);
      toast.success("User deleted.");
      router.refresh(); // Refresh data on the page
    } catch (error: any) {
      const errorMsg =
        error.response?.data ||
        "Failed to delete user. Make sure you are not deleting your own account.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
      setOpenDeleteConfirm(false); // Close the modal
    }
  };

  // --- Change Status Handler ---
  const onChangeStatus = async () => {
    // ... (keep existing status change logic)
    try {
      setLoading(true);
      const newStatus = isActive ? UserStatus.INACTIVE : UserStatus.ACTIVE;
      await axios.patch(`/api/admin/users/${data.id}`, { status: newStatus });
      toast.success(
        `User ${newStatus === UserStatus.ACTIVE ? "activated" : "deactivated"}.`
      );
      router.refresh();
    } catch (error) {
      toast.error("Failed to update user status.");
    } finally {
      setLoading(false);
    }
  };

  // --- Edit Role Handler (Placeholder/Basic) ---
  const onEditRole = () => {
    // ... (keep existing role edit placeholder)
    toast("Role editing functionality not yet implemented.");
    console.log("Attempting to edit role for user:", data.id);
  };

  // --- View Details Handler ---
  const onViewDetails = () => {
    router.push(`/${params.storeId}/admin/users/${data.id}`);
  };

  // --- Edit Limit Handlers ---
  const onOpenEditLimitModal = () => {
    // Set initial value for the input (use null or the actual number)
    setCurrentLimitValue(
      data.maxSavedDesigns === null ? "" : data.maxSavedDesigns
    );
    setIsEditLimitModalOpen(true);
  };

  const onSaveLimit = async () => {
    try {
      setLoading(true);
      // Validate input: allow empty string (for null) or a non-negative integer
      const valueToSave =
        currentLimitValue === "" ? null : Number(currentLimitValue);

      if (
        valueToSave !== null &&
        (isNaN(valueToSave) ||
          valueToSave < 0 ||
          !Number.isInteger(valueToSave))
      ) {
        toast.error(
          "Invalid limit. Must be empty or a non-negative whole number."
        );
        setLoading(false); // Stop loading on validation error
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
      {/* Alert Modal for Delete Confirmation */}
      <AlertModal
        isOpen={openDeleteConfirm}
        onClose={() => setOpenDeleteConfirm(false)}
        onConfirm={onDelete}
        loading={loading}
      />

      {/* Edit Limit Modal */}
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

      {/* Dropdown Menu */}
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
          {/* Add Edit Limit Item */}
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
            disabled={loading || isAdmin} // Also disable deleting admins
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
