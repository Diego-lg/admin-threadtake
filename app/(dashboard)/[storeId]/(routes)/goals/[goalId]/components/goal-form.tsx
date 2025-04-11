"use client";

import * as z from "zod";
import axios from "axios";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { Trash } from "lucide-react";
import { SalesGoal, MetricType, TimePeriod } from "@prisma/client"; // Import Prisma types
import { useParams, useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Heading } from "@/components/ui/heading";
import { AlertModal } from "@/components/modals/alert-modal"; // For delete confirmation
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Import Select components

// Define the form schema using Zod
const formSchema = z.object({
  metricType: z.nativeEnum(MetricType), // Use nativeEnum for Prisma enums
  timePeriod: z.nativeEnum(TimePeriod),
  targetValue: z.coerce
    .number()
    .min(0.01, { message: "Target must be positive" }), // Coerce to number and validate
});

// Infer the TypeScript type from the Zod schema
type GoalFormValues = z.infer<typeof formSchema>;

interface GoalFormProps {
  initialData: SalesGoal | null; // Allow null for creating new goals
}

export const GoalForm: React.FC<GoalFormProps> = ({ initialData }) => {
  const params = useParams();
  const router = useRouter();

  const [open, setOpen] = useState(false); // State for delete confirmation modal
  const [loading, setLoading] = useState(false);

  // Determine mode and set dynamic titles/actions
  const title = initialData ? "Edit goal" : "Create goal";
  const description = initialData
    ? "Edit an existing goal."
    : "Add a new goal.";
  const toastMessage = initialData ? "Goal updated." : "Goal created.";
  const action = initialData ? "Save changes" : "Create";

  // Initialize the form with react-hook-form
  const form = useForm<GoalFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      // Provide default values if creating a new goal
      metricType: MetricType.REVENUE, // Default metric
      timePeriod: TimePeriod.MONTHLY, // Default period
      targetValue: 0,
    },
  });

  // Form submission handler
  const onSubmit = async (data: GoalFormValues) => {
    try {
      setLoading(true);
      const apiData = initialData ? { ...data, goalId: initialData.id } : data;
      // Use the POST endpoint for both create and update (endpoint handles logic based on goalId presence)
      await axios.post(`/api/${params.storeId}/sales-goals`, apiData);

      router.refresh(); // Refresh data on the previous page
      router.push(`/${params.storeId}/goals`); // Redirect back to the goals list
      toast.success(toastMessage);
    } catch (error: any) {
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Delete handler
  const onDelete = async () => {
    try {
      setLoading(true);
      // TODO: Implement DELETE API endpoint: /api/[storeId]/sales-goals/[goalId]
      await axios.delete(
        `/api/${params.storeId}/sales-goals/${initialData?.id}`
      );
      router.refresh();
      router.push(`/${params.storeId}/goals`);
      toast.success("Goal deleted.");
    } catch (error: any) {
      toast.error("Failed to delete goal."); // Add specific error handling if needed
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
        {initialData && ( // Only show delete button if editing
          <Button
            disabled={loading}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 w-full"
        >
          <div className="md:grid md:grid-cols-3 gap-8">
            {/* Metric Type Select */}
            <FormField
              control={form.control}
              name="metricType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Metric Type</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a metric"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(MetricType).map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0) +
                            type.slice(1).toLowerCase().replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Time Period Select */}
            <FormField
              control={form.control}
              name="timePeriod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time Period</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a period"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.values(TimePeriod).map((period) => (
                        <SelectItem key={period} value={period}>
                          {period.charAt(0) + period.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Target Value Input */}
            <FormField
              control={form.control}
              name="targetValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target Value</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="Enter target value"
                      step="0.01" // Allow decimals for revenue
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
