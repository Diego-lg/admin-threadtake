"use client";

import axios from "axios";
import { useState } from "react";
import { Edit, MoreHorizontal, Trash } from "lucide-react";
import { toast } from "react-hot-toast";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertModal } from "@/components/modals/alert-modal"; // Assuming this modal exists for delete confirmation

import { GoalColumn } from "./columns"; // Import the column type

interface CellActionProps {
  data: GoalColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const [open, setOpen] = useState(false); // State for delete confirmation modal
  const [loading, setLoading] = useState(false);

  const onEdit = () => {
    // Navigate to the edit page for this specific goal
    router.push(`/${params.storeId}/goals/${data.id}`);
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      // TODO: Implement DELETE API endpoint: /api/[storeId]/sales-goals/[goalId]
      await axios.delete(`/api/${params.storeId}/sales-goals/${data.id}`);
      toast.success("Goal deleted.");
      router.refresh(); // Refresh the page to show updated list
    } catch (error) {
      toast.error("Failed to delete goal. Make sure it's not in use."); // Adjust error message as needed
    } finally {
      setLoading(false);
      setOpen(false); // Close the confirmation modal
    }
  };

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" /> Edit Goal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen(true)}>
            {" "}
            {/* Open confirmation modal */}
            <Trash className="mr-2 h-4 w-4" /> Delete Goal
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
