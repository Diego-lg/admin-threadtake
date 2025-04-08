"use client";

import { useState } from "react";
import { useRouter } from "next/navigation"; // Use next/navigation
import {
  MoreHorizontal,
  Eye /* Add other icons as needed */,
} from "lucide-react";
import { toast } from "react-hot-toast";
// import axios from "axios"; // Import if needed for delete/update actions

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
// import { AlertModal } from "@/components/modals/alert-modal"; // Import if delete confirmation is needed

import { MarketplaceProductColumn } from "./columns";

interface CellActionProps {
  data: MarketplaceProductColumn;
}

export const CellAction: React.FC<CellActionProps> = ({ data }) => {
  const router = useRouter();
  // const params = useParams(); // Use if storeId is needed for actions
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false); // For alert modal if used

  const onViewDesign = () => {
    // Open the design page on the storefront in a new tab
    const designUrl = `http://localhost:3001/designs/${data.designId}`;
    window.open(designUrl, "_blank");
  };

  const onViewProduct = () => {
    // Open the product page on the storefront in a new tab
    const productUrl = `http://localhost:3001/product/${data.id}`;
    window.open(productUrl, "_blank");
  };

  // Add other actions like 'Archive', 'Unshare', 'Delete' if needed
  // const onArchive = async () => { ... };
  // const onDelete = async () => { ... };

  return (
    <>
      {/* <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete} // Example: Link confirm to delete action
        loading={loading}
      /> */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={onViewDesign}>
            <Eye className="mr-2 h-4 w-4" /> View Design (Storefront)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onViewProduct}>
            <Eye className="mr-2 h-4 w-4" /> View Product (Storefront)
          </DropdownMenuItem>
          {/* Add other actions here */}
          {/* <DropdownMenuItem onClick={() => setOpen(true)}>
            <Trash className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem> */}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
