"use client";

import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action"; // We will create this later for actions like view design/product
import { Checkbox } from "@/components/ui/checkbox"; // Assuming Checkbox component exists
import { Badge } from "@/components/ui/badge"; // Assuming Badge component exists

// Define the shape of the data for each row in the table
export type MarketplaceProductColumn = {
  id: string; // Product ID
  name: string; // Product Name
  price: string; // Formatted price
  creatorName: string; // Creator's Name
  isShared: boolean; // Design's shared status
  createdAt: string; // Formatted creation date
  designId: string; // Original SavedDesign ID
  // Add other fields if needed, e.g., category, size, color swatch
  category: string;
  size: string;
  color: string; // Hex value for swatch
};

export const columns: ColumnDef<MarketplaceProductColumn>[] = [
  // Optional: Select Checkbox column if bulk actions are needed
  // {
  //   id: "select",
  //   header: ({ table }) => (
  //     <Checkbox
  //       checked={table.getIsAllPageRowsSelected()}
  //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
  //       aria-label="Select all"
  //     />
  //   ),
  //   cell: ({ row }) => (
  //     <Checkbox
  //       checked={row.getIsSelected()}
  //       onCheckedChange={(value) => row.toggleSelected(!!value)}
  //       aria-label="Select row"
  //     />
  //   ),
  //   enableSorting: false,
  //   enableHiding: false,
  // },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "creatorName",
    header: "Creator",
  },
  {
    accessorKey: "price",
    header: "Price",
  },
  {
    accessorKey: "category",
    header: "Category",
  },
  {
    accessorKey: "size",
    header: "Size",
  },
  {
    accessorKey: "color",
    header: "Color",
    cell: ({ row }) => (
      <div className="flex items-center gap-x-2">
        <div
          className="h-6 w-6 rounded-full border"
          style={{ backgroundColor: row.original.color }}
        />
      </div>
    ),
  },
  {
    accessorKey: "isShared",
    header: "Shared Status",
    cell: ({ row }) =>
      row.original.isShared ? (
        <Badge variant="default">Shared</Badge> // Use Badge component
      ) : (
        <Badge variant="secondary">Private</Badge>
      ),
  },
  {
    accessorKey: "createdAt",
    header: "Date Created",
  },
  {
    id: "actions",
    // Render the CellAction component for row-specific actions
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
