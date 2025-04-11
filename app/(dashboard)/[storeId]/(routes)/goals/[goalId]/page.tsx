import prismadb from "@/lib/prismadb";

import { GoalForm } from "./components/goal-form"; // To be created

const GoalPage = async ({
  params,
}: {
  params: { goalId: string; storeId: string };
}) => {
  let goal = null;

  // Check if we are editing an existing goal (goalId is not 'new')
  if (params.goalId !== "new") {
    goal = await prismadb.salesGoal.findUnique({
      where: {
        id: params.goalId,
        storeId: params.storeId, // Ensure goal belongs to the correct store
      },
    });
    // Optional: Redirect if goal not found for the given store?
    // if (!goal) { redirect(`/${params.storeId}/goals`); }
  }

  // Prepare initial data for the form
  // If creating ('new'), initialData will be null or have default values
  // If editing, initialData will be the fetched goal
  const initialData = goal
    ? {
        ...goal,
        targetValue: goal.targetValue, // Ensure targetValue is passed correctly
      }
    : null;

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        {/* Pass initialData (null for new, goal data for edit) */}
        <GoalForm initialData={initialData} />
      </div>
    </div>
  );
};

export default GoalPage;
