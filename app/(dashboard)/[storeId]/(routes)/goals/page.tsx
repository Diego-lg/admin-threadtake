import { format } from "date-fns";

import { GoalsClient } from "./components/client"; // To be created
import { GoalColumn } from "./components/columns"; // To be created
import { SalesGoalWithProgress } from "@/components/ui/goal-tracker"; // Use the extended type

const GoalsPage = async ({ params }: { params: { storeId: string } }) => {
  // Fetch existing goals to display in the table
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"; // Adjust port if needed
  let salesGoals: SalesGoalWithProgress[] = [];
  try {
    // Use the same API endpoint used by the dashboard overview
    const res = await fetch(`${baseUrl}/api/${params.storeId}/sales-goals`, {
      cache: "no-store",
    });
    if (res.ok) {
      salesGoals = await res.json();
    } else {
      console.error(
        "Failed to fetch sales goals for management:",
        res.status,
        await res.text()
      );
    }
  } catch (error) {
    console.error("Error fetching sales goals for management:", error);
  }

  // Format data for the table columns
  const formattedGoals: GoalColumn[] = salesGoals.map((item) => ({
    id: item.id,
    metricType: item.metricType,
    targetValue: item.targetValue, // Keep as number for potential sorting/filtering
    timePeriod: item.timePeriod,
    currentProgress: item.currentProgress, // Pass progress for display
    createdAt: format(new Date(item.createdAt), "MMMM do, yyyy"), // Format date
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <GoalsClient data={formattedGoals} />
      </div>
    </div>
  );
};

export default GoalsPage;
