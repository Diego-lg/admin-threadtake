"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MetricType, TimePeriod } from "@prisma/client";
import { CellAction } from "./cell-action"; // To be created
import { formatter } from "@/lib/utils"; // Assuming currency formatter exists
import { Progress } from "@/components/ui/progress"; // Use the Progress component

// Define the shape of the data for each row in the table
export type GoalColumn = {
  id: string;
  metricType: MetricType;
  targetValue: number;
  timePeriod: TimePeriod;
  currentProgress: number; // Include progress for display
  createdAt: string; // Formatted creation date
};

// Helper to format display text
const formatEnum = (value: string): string => {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export const columns: ColumnDef<GoalColumn>[] = [
  {
    accessorKey: "metricType",
    header: "Metric",
    cell: ({ row }) => formatEnum(row.original.metricType),
  },
  {
    accessorKey: "timePeriod",
    header: "Period",
    cell: ({ row }) => formatEnum(row.original.timePeriod),
  },
  {
    accessorKey: "targetValue",
    header: "Target",
    cell: ({ row }) => {
      const formatted =
        row.original.metricType === MetricType.REVENUE
          ? formatter.format(row.original.targetValue)
          : row.original.targetValue.toString();
      return <div className="text-right font-medium">{formatted}</div>;
    },
  },
  {
    accessorKey: "currentProgress",
    header: "Progress",
    cell: ({ row }) => {
      const goal = row.original;
      const progressPercent =
        goal.targetValue > 0
          ? (goal.currentProgress / goal.targetValue) * 100
          : 0;
      const formattedProgress =
        goal.metricType === MetricType.REVENUE
          ? formatter.format(goal.currentProgress)
          : goal.currentProgress.toString();

      return (
        <div className="flex flex-col">
          <Progress value={progressPercent} className="h-2 w-full" />
          <span className="text-xs text-muted-foreground mt-1">
            {formattedProgress} ({Math.round(progressPercent)}%)
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Date Created",
  },
  {
    id: "actions",
    // Render the CellAction component for row-specific actions (Edit, Delete)
    cell: ({ row }) => <CellAction data={row.original} />,
  },
];
