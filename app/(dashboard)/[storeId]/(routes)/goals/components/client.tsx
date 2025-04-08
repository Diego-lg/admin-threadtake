"use client";

import { useState } from "react";

import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation"; // Use next/navigation
import { RowSelectionState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
// import { ApiList } from "@/components/ui/api-list"; // Optional: If API list is needed

import { columns, GoalColumn } from "./columns";

interface GoalsClientProps {
  data: GoalColumn[];
}

export const GoalsClient: React.FC<GoalsClientProps> = ({ data }) => {
  const params = useParams();
  const router = useRouter();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Sales Goals (${data.length})`}
          description="Manage sales goals for your store"
        />
        <Button onClick={() => router.push(`/${params.storeId}/goals/new`)}>
          {" "}
          {/* Link to a 'new goal' page */}
          <Plus className="mr-2 h-4 w-4" /> Add New Goal
        </Button>
      </div>
      <Separator />
      <DataTable
        searchKey="metricType"
        columns={columns}
        data={data}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />{" "}
      {/* Example search key */}
      {/* Optional: API List */}
      {/* <Heading title="API" description="API Calls for Sales Goals" />
      <Separator />
      <ApiList entityName="salesGoals" entityIdName="goalId" /> */}
    </>
  );
};
