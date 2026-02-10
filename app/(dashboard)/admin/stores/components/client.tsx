"use client";

import { useState } from "react";
import { RowSelectionState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

import { columns } from "./columns";
import { StoreColumn } from "./types";

interface StoreClientProps {
  data: StoreColumn[];
}

export const StoreClient: React.FC<StoreClientProps> = ({ data }) => {
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Stores (${data.length})`}
          description="Manage all stores in the system"
        />
      </div>
      <Separator />

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
