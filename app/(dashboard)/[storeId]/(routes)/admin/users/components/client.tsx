"use client";

import { useState } from "react"; // Import useState
import axios from "axios"; // Import axios
import { toast } from "react-hot-toast"; // Import toast
import { RowSelectionState } from "@tanstack/react-table"; // Import table state type
import { Trash, ToggleLeft, ToggleRight, Plus } from "lucide-react"; // Import icons
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table"; // Assuming DataTable is in this location
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"; // Import DropdownMenu
import { AlertModal } from "@/components/modals/alert-modal"; // Import AlertModal
// import { ApiList } from "@/components/ui/api-list";

import { columns, UserColumn } from "./columns";

interface UserClientProps {
  data: UserColumn[];
}

export const UserClient: React.FC<UserClientProps> = ({ data }) => {
  const params = useParams();
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({}); // State for selected rows
  const [loading, setLoading] = useState(false); // State for loading indicator
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false); // State for bulk delete confirmation modal

  const selectedUserIds = Object.keys(rowSelection).map(
    (index) => data[parseInt(index)].id
  );
  const numSelected = selectedUserIds.length;

  // --- Bulk Action Handler ---
  const handleBulkAction = async (
    action: "activate" | "deactivate" | "delete"
  ) => {
    if (numSelected === 0) {
      toast.error("No users selected.");
      return;
    }

    // Confirmation for delete
    if (action === "delete") {
      setBulkDeleteOpen(true); // Open confirmation modal first
      return;
    }

    // Proceed with activate/deactivate
    setLoading(true);
    try {
      const response = await axios.patch(`/api/admin/users/bulk`, {
        userIds: selectedUserIds,
        action,
      });
      toast.success(
        response.data.message || `Successfully performed bulk ${action}.`
      );
      router.refresh();
      setRowSelection({}); // Reset selection
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message ||
        error.response?.data ||
        `Failed to perform bulk ${action}.`;
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // --- Bulk Delete Confirmation Handler ---
  const onBulkDeleteConfirm = async () => {
    setBulkDeleteOpen(false); // Close modal
    setLoading(true);
    try {
      const response = await axios.patch(`/api/admin/users/bulk`, {
        userIds: selectedUserIds,
        action: "delete",
      }); // Use PATCH as defined in API
      toast.success(
        response.data.message || `Successfully deleted selected users.`
      );
      router.refresh();
      setRowSelection({}); // Reset selection
    } catch (error: any) {
      const errorMsg =
        error.response?.data?.message ||
        error.response?.data ||
        "Failed to perform bulk delete.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Bulk Delete Confirmation Modal */}
      <AlertModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={onBulkDeleteConfirm}
        loading={loading}
        title={`Delete ${numSelected} User(s)?`}
        description="This action cannot be undone. Admin accounts will be skipped."
      />

      {/* Heading and Optional Add Button */}
      <div className="flex items-center justify-between">
        <Heading
          title={`Users (${data.length})`}
          description="Manage users for your application"
        />
        {/* Optional Add Button */}
      </div>
      <Separator />

      {/* Bulk Actions Dropdown (appears when rows are selected) */}
      {numSelected > 0 && (
        <div className="mb-4 flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={loading}>
                Actions ({numSelected}){" "}
                <span className="sr-only">Bulk Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Bulk Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleBulkAction("activate")}
                disabled={loading}
              >
                <ToggleRight className="mr-2 h-4 w-4" /> Activate Selected
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleBulkAction("deactivate")}
                disabled={loading}
              >
                <ToggleLeft className="mr-2 h-4 w-4" /> Deactivate Selected
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleBulkAction("delete")}
                disabled={loading}
                className="text-red-600 focus:text-red-700"
              >
                <Trash className="mr-2 h-4 w-4" /> Delete Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* DataTable */}
      <DataTable
        searchKey="name"
        columns={columns}
        data={data}
        // Pass state and handler for row selection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />

      {/* Optional: API List for developers (might not be needed for user management) */}
      {/* <Heading title="API" description="API Calls for Users" />
      <Separator />
      <ApiList entityName="users" entityIdName="userId" /> */}
    </>
  );
};
