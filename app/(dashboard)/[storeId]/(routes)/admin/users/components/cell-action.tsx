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

import { UserColumn } from "./columns"; // Import the type

interface CellActionProps {
  data: UserColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams(); // Contains storeId
  const [open, setOpen] = useState(false); // State for alert modal
  const [loading, setLoading] = useState(false);

  const isAdmin = data.role === UserRole.ADMIN;
  const isActive = data.status === UserStatus.ACTIVE;

  // --- Delete Handler ---
  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/admin/users/${data.id}`);
      toast.success("User deleted.");
      router.refresh(); // Refresh data on the page
    } catch (error: any) {
      // Check if the error response has specific details
      const errorMsg =
        error.response?.data ||
        "Failed to delete user. Make sure you are not deleting your own account.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
      setOpen(false); // Close the modal
    }
  };

  // --- Change Status Handler ---
  const onChangeStatus = async () => {
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
    // TODO: Implement role editing, likely via a modal
    // For now, just log or show a toast
    toast("Role editing functionality not yet implemented.");
    console.log("Attempting to edit role for user:", data.id);
    // Example: router.push(`/${params.storeId}/admin/users/${data.id}/edit-role`); // Or open modal
  };

  // --- View Details Handler ---
  const onViewDetails = () => {
    router.push(`/${params.storeId}/admin/users/${data.id}`);
  };

  return (
    <>
      {/* Alert Modal for Delete Confirmation */}
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
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
            onClick={() => setOpen(true)}
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
