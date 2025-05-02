// backend_threadtake/app/(dashboard)/[storeId]/(routes)/settings/page.tsx
import React from "react";
import prismadb from "@/lib/prismadb"; // Or fetch settings client-side if preferred

import { SettingsForm } from "./components/settings-form";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

// Helper function to get or create the general settings (can reuse from API)
async function getGeneralSettings() {
  let settings = await prismadb.generalSetting.findFirst();
  if (!settings) {
    // If running server-side and settings don't exist,
    // it's better to create them here or ensure they are created on app startup.
    // For simplicity, we'll assume they might exist or handle creation client-side/API.
    // Returning a default structure or null might be necessary.
    console.warn(
      "General settings not found on server-side render. Creating defaults might be needed."
    );
    // Create initial settings if they absolutely must exist for the form
    settings = await prismadb.generalSetting.create({ data: {} });
    console.log("Created default settings during page load.");
    // Or return a default object structure:
    // return { id: 'temp-id', defaultMaxSavedDesigns: 10, createdAt: new Date(), updatedAt: new Date() };
  }
  return settings;
}

const SettingsPage = async ({
  params,
}: {
  params: { storeId: string }; // Keep storeId param if layout depends on it
}) => {
  // Fetch initial settings data server-side
  const settings = await getGeneralSettings();

  // Ensure settings is not null if required by SettingsForm
  if (!settings) {
    // Handle case where settings are still null (e.g., DB error)
    // Maybe render an error message or default form state
    console.error("Failed to fetch or create general settings for the page.");
    // You might want to return an error component or throw an error
    return <div>Error loading settings. Please try again later.</div>;
  }

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Heading
          title="Settings"
          description="Manage application-wide settings."
        />
        <Separator />
        {/* Pass initial data to the client component */}
        <SettingsForm initialData={settings} />
      </div>
    </div>
  );
};

export default SettingsPage;
