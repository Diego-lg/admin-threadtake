"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { RowSelectionState } from "@tanstack/react-table";
import {
  ColorColumn,
  columns as colorColumns,
} from "../../colors/components/columns";
import {
  SizeColumn,
  columns as sizeColumns,
} from "../../sizes/components/columns";
import { DataTable } from "@/components/ui/data-table";

interface ProductOptionsClientProps {
  colors: ColorColumn[];
  sizes: SizeColumn[];
}

export const ProductOptionsClient: React.FC<ProductOptionsClientProps> = ({
  colors,
  sizes,
}) => {
  const router = useRouter();
  const params = useParams();
  const [colorSelection, setColorSelection] = useState<RowSelectionState>({});
  const [sizeSelection, setSizeSelection] = useState<RowSelectionState>({});

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Product Options (${colors.length + sizes.length})`}
          description="Manage colors and sizes for your store"
        />
      </div>
      <Separator />

      {/* Colors Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Colors</h2>
            <p className="text-muted-foreground">
              Manage product colors for your store
            </p>
          </div>
          <Button
            onClick={() => router.push(`/${params.storeId}/colors/create`)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Color
          </Button>
        </div>

        <DataTable
          searchKey="name"
          columns={colorColumns}
          data={colors}
          rowSelection={colorSelection}
          onRowSelectionChange={setColorSelection}
        />
      </div>

      <Separator className="my-8" />

      {/* Sizes Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Sizes</h2>
            <p className="text-muted-foreground">
              Manage product sizes for your store
            </p>
          </div>
          <Button onClick={() => router.push(`/${params.storeId}/sizes/new`)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Size
          </Button>
        </div>

        <DataTable
          searchKey="name"
          columns={sizeColumns}
          data={sizes}
          rowSelection={sizeSelection}
          onRowSelectionChange={setSizeSelection}
        />
      </div>
    </>
  );
};
