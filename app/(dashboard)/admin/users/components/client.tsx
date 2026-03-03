"use client";

import { useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { RowSelectionState } from "@tanstack/react-table";
import { Trash, ToggleLeft, ToggleRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertModal } from "@/components/modals/alert-modal";

import { columns, UserColumn } from "./columns";

interface UserClientProps {
  data: UserColumn[];
}

export const UserClient: React.FC<UserClientProps> = ({ data }) => {
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [loading, setLoading] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const selectedUserIds = Object.keys(rowSelection).map(
    (index) => data[parseInt(index)].id,
  );
  const numSelected = selectedUserIds.length;

  const handleBulkAction = async (
    action: "activate" | "deactivate" | "delete",
  ) => {
    if (numSelected === 0) {
      toast.error("No users selected.");
      return;
    }

    if (action === "delete") {
      setBulkDeleteOpen(true);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.patch(`/api/admin/users/bulk`, {
        userIds: selectedUserIds,
        action,
      });
      toast.success(
        response.data.message || `Successfully performed bulk ${action}.`,
      );
      router.refresh();
      setRowSelection({});
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

  const onBulkDeleteConfirm = async () => {
    setBulkDeleteOpen(false);
    setLoading(true);
    try {
      const response = await axios.patch(`/api/admin/users/bulk`, {
        userIds: selectedUserIds,
        action: "delete",
      });
      toast.success(
        response.data.message || `Successfully deleted selected users.`,
      );
      router.refresh();
      setRowSelection({});
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
      <AlertModal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={onBulkDeleteConfirm}
        loading={loading}
        title={`Delete ${numSelected} User(s)?`}
        description="This action cannot be undone. Admin accounts will be skipped."
      />

      <div className="flex items-center justify-between">
        <Heading
          title={`Users (${data.length})`}
          description="Manage users for your application"
        />
      </div>
      <Separator />

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

      <DataTable
        searchKey="name"
        columns={columns}
        data={data}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />
    </>
  );
};
