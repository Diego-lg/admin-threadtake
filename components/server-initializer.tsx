"use client";

import { useEffect } from "react";

export function ServerInitializer() {
  useEffect(() => {
    // Only initialize on client side and only once
    const initializeServices = async () => {
      try {
        console.log("[CLIENT_INIT] Initializing server services...");

        // Check if services are already initialized
        const checkResponse = await fetch("/api/init", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (checkResponse.ok) {
          const result = await checkResponse.json();
          if (result.success) {
            console.log("[CLIENT_INIT] ✅ Server services already initialized");
            return;
          }
        }

        // Initialize services if not already done
        const response = await fetch("/api/init", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const result = await response.json();
          console.log("[CLIENT_INIT] ✅ Server services initialized:", result);
        } else {
          console.error(
            "[CLIENT_INIT] ❌ Failed to initialize server services"
          );
        }
      } catch (error) {
        console.error(
          "[CLIENT_INIT] Error initializing server services:",
          error
        );
      }
    };

    // Initialize services with a small delay to ensure the server is ready
    const timer = setTimeout(initializeServices, 1000);

    return () => clearTimeout(timer);
  }, []);

  // This component doesn't render anything
  return null;
}
