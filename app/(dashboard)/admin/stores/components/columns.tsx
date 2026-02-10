"use client";

import { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import { StoreColumn } from "./types";

export type { StoreColumn };

export const columns: ColumnDef<StoreColumn>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "userId",
    header: "Owner ID",
  },
  {
    accessorKey: "productCount",
    header: "Products",
  },
  {
    accessorKey: "orderCount",
    header: "Orders",
  },
  {
    accessorKey: "categoryCount",
    header: "Categories",
  },
  {
    accessorKey: "billboardCount",
    header: "Billboards",
  },
  {
    accessorKey: "createdAt",
    header: "Created",
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
