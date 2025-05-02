// backend_threadtake/app/(dashboard)/[storeId]/(routes)/settings/components/settings-form.tsx
"use client"; // This is a client component

import * as z from "zod";
import axios from "axios";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { GeneralSetting } from "@prisma/client"; // Import the type
import { useRouter } from "next/navigation"; // Use next/navigation
import { useState } from "react";

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
import { ApiAlert } from "@/components/ui/api-alert"; // Import ApiAlert for displaying endpoints
import { useOrigin } from "@/hooks/use-origin"; // Import useOrigin hook
// Import AlertModal if needed for delete confirmation (not used here yet)
// import { AlertModal } from "@/components/modals/alert-modal";

// Define the form schema using Zod
const formSchema = z.object({
  defaultMaxSavedDesigns: z
    .preprocess(
      (val) =>
        val === "" || val === null || val === undefined ? null : Number(val), // Convert empty/null/undefined to null, otherwise number
      z.number().int().nonnegative("Must be a non-negative number.").nullable() // Allow null or non-negative integer
    )
    .describe(
      "The default maximum number of designs a user can save. Leave blank for unlimited (uses null)."
    ),
});

// Infer the type from the schema
type SettingsFormValues = z.infer<typeof formSchema>;

interface SettingsFormProps {
  initialData: GeneralSetting | null; // Allow null if settings might not exist initially
}

export const SettingsForm: React.FC<SettingsFormProps> = ({ initialData }) => {
  const router = useRouter();
  const origin = useOrigin(); // Get the base URL
  const [loading, setLoading] = useState(false);

  // Initialize the form with default values from initialData
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          // Ensure the value passed is a number or null
          defaultMaxSavedDesigns: initialData.defaultMaxSavedDesigns,
        }
      : {
          defaultMaxSavedDesigns: null, // Default to null if no initial data
        },
  });

  const onSubmit = async (data: SettingsFormValues) => {
    try {
      setLoading(true);
      // Make API call to update settings
      // Ensure the value sent is either a number or explicitly null
      const payload = {
        defaultMaxSavedDesigns:
          data.defaultMaxSavedDesigns === null
            ? null
            : Number(data.defaultMaxSavedDesigns),
      };
      await axios.patch(`/api/settings/general`, payload); // Send processed data
      router.refresh(); // Refresh server components
      toast.success("Settings updated.");
      console.log("Settings updated successfully:", payload);
    } catch (error: any) {
      console.error("Error updating settings:", error);
      // Provide more specific error feedback if possible
      const errorMsg = error.response?.data || "Something went wrong.";
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* AlertModal can be added here if needed */}
      <div className="flex items-center justify-between">
        <Heading
          title="General Settings"
          description="Manage global application settings."
        />
        {/* Add other actions like delete if needed */}
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 w-full"
        >
          <div className="md:grid md:grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="defaultMaxSavedDesigns"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Max Saved Designs</FormLabel>
                  <FormControl>
                    {/* Use type="number" but handle potential string values and null */}
                    <Input
                      type="number"
                      min="0" // HTML5 validation for non-negative
                      step="1" // Allow only integers
                      disabled={loading}
                      placeholder="Leave blank for unlimited"
                      // Handle value conversion carefully for controlled component
                      value={field.value === null ? "" : String(field.value)} // Display empty string for null
                      onChange={(e) => {
                        const val = e.target.value;
                        // Convert to number for form state, handle empty string as null
                        field.onChange(val === "" ? null : parseInt(val, 10));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Add more settings fields here */}
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            Save changes
          </Button>
        </form>
      </Form>
      <Separator />
      {/* Manually display API endpoints */}
      <Heading
        title="API Endpoints"
        description="API calls for managing general settings."
      />
      <div className="space-y-4 pt-4">
        <ApiAlert
          title="GET"
          variant="public"
          description={`${process.env.NEXT_PUBLIC_API_URL}/api/settings/general`}
        />
        <ApiAlert
          title="PATCH"
          variant="admin"
          description={`${process.env.NEXT_PUBLIC_API_URL}/api/settings/general`}
        />
      </div>
    </>
  );
};
