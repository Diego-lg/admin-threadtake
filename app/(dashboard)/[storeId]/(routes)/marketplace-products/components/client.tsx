"use client";

import { useState } from "react";

import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { DataTable } from "@/components/ui/data-table"; // Assuming DataTable component exists
import { RowSelectionState } from "@tanstack/react-table";

import { MarketplaceProductColumn, columns } from "./columns";

interface MarketplaceProductClientProps {
  data: MarketplaceProductColumn[];
}

export const MarketplaceProductClient: React.FC<
  MarketplaceProductClientProps
> = ({ data }) => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Marketplace Products (${data.length})`}
          description="Manage products generated from user designs for the marketplace"
        />
        {/* Add Button for potential future actions like bulk operations */}
        {/* <Button onClick={() => router.push(`/${params.storeId}/products/new`)}>
          <Plus className="mr-2 h-4 w-4" /> Add New
        </Button> */}
      </div>
      <Separator />
      {/* Assuming DataTable component takes 'columns' and 'data' props */}
      {/* Add searchKey if filtering by name is desired */}
      <DataTable
        searchKey="name"
        columns={columns}
        data={data}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />
      {/* Optional: Add API List component if needed */}
      {/* <Heading title="API" description="API calls for Marketplace Products" />
      <Separator />
      <ApiList entityName="marketplaceProducts" entityIdName="marketplaceProductId" /> */}
    </>
  );
};
