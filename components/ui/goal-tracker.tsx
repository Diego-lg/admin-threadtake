"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress"; // Assuming Progress component exists
import { Badge } from "@/components/ui/badge"; // Assuming Badge component exists
import { SalesGoal, MetricType, TimePeriod } from "@prisma/client"; // Import generated types
import { formatter } from "@/lib/utils"; // Assuming currency formatter exists

// Extend the SalesGoal type to include calculated progress and dates from API response
export interface SalesGoalWithProgress extends SalesGoal {
  currentProgress: number;
  startDate: Date | string; // API might return string dates
  endDate: Date | string;
}

interface GoalTrackerProps {
  goal: SalesGoalWithProgress;
}

// Helper to format the goal title
const formatGoalTitle = (metric: MetricType, period: TimePeriod): string => {
  const metricText = metric === MetricType.REVENUE ? "Revenue" : "Units Sold";
  const periodText =
    period === TimePeriod.DAILY
      ? "Daily"
      : period === TimePeriod.WEEKLY
      ? "Weekly"
      : "Monthly";
  return `${periodText} ${metricText} Goal`;
};

// Helper to format the progress value
const formatProgressValue = (value: number, metric: MetricType): string => {
  return metric === MetricType.REVENUE
    ? formatter.format(value)
    : value.toString();
};

// Helper to calculate pacing status
const getPacingStatus = (
  goal: SalesGoalWithProgress
): { status: "ahead" | "on_pace" | "behind"; label: string } => {
  const now = new Date();
  const startDate = new Date(goal.startDate);
  const endDate = new Date(goal.endDate);

  // Ensure dates are valid before proceeding
  if (
    isNaN(startDate.getTime()) ||
    isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) {
    return { status: "behind", label: "Invalid Date Range" };
  }

  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsedDuration = now.getTime() - startDate.getTime();

  // Handle cases where current time is outside the goal period
  if (elapsedDuration < 0) return { status: "on_pace", label: "Not Started" }; // Goal hasn't started
  if (elapsedDuration > totalDuration) {
    // Goal period finished, check if target met
    return goal.currentProgress >= goal.targetValue
      ? { status: "ahead", label: "Met" }
      : { status: "behind", label: "Missed" };
  }

  const timeElapsedFraction = elapsedDuration / totalDuration;
  const expectedProgress = goal.targetValue * timeElapsedFraction;

  // Add a small tolerance (e.g., 5%) for "on pace"
  const tolerance = 0.05;
  if (goal.currentProgress >= expectedProgress * (1 - tolerance)) {
    // Check if significantly ahead (e.g., > 10% over expected)
    if (goal.currentProgress > expectedProgress * (1 + tolerance * 2)) {
      return { status: "ahead", label: "Ahead" };
    }
    return { status: "on_pace", label: "On Pace" };
  } else {
    return { status: "behind", label: "Behind" };
  }
};

export const GoalTracker: React.FC<GoalTrackerProps> = ({ goal }) => {
  const progressPercent =
    goal.targetValue > 0 ? (goal.currentProgress / goal.targetValue) * 100 : 0;
  const pacing = getPacingStatus(goal);

  const pacingColor =
    pacing.status === "ahead"
      ? "bg-green-500 hover:bg-green-600"
      : pacing.status === "on_pace"
      ? "bg-yellow-500 hover:bg-yellow-600"
      : "bg-red-500 hover:bg-red-600";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {formatGoalTitle(goal.metricType, goal.timePeriod)}
        </CardTitle>
        <Badge className={`text-xs ${pacingColor}`}>{pacing.label}</Badge>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formatProgressValue(goal.currentProgress, goal.metricType)}
        </div>
        <p className="text-xs text-muted-foreground">
          Target: {formatProgressValue(goal.targetValue, goal.metricType)}
        </p>
        <Progress value={progressPercent} className="mt-2 h-2" />
      </CardContent>
    </Card>
  );
};
