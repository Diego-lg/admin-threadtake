"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion"; // For animations
import { formatter } from "@/lib/utils"; // Assuming currency formatter exists
import { ShoppingCart, MapPin } from "lucide-react"; // Example icons

// Define the structure of a single sales event received from SSE
interface SalesEvent {
  id: string; // Unique key for the event/order
  productName: string; // Or description like "Multiple Items"
  value: number;
  location?: string; // e.g., "City, Country"
  timestamp: number; // Unix timestamp or similar
}

// Define props for the component (e.g., storeId to connect to the right SSE endpoint)
interface SalesTickerProps {
  storeId: string;
  maxItems?: number; // Max number of items to show in the ticker
}

// Helper to format relative time
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const secondsAgo = Math.round((now - timestamp) / 1000);

  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  return `${hoursAgo}h ago`;
};

export const SalesTicker: React.FC<SalesTickerProps> = ({
  storeId,
  maxItems = 5, // Default to showing 5 items
}) => {
  const [events, setEvents] = useState<SalesEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Establish SSE connection when component mounts
    // TODO: Adjust the endpoint URL as needed
    const sseUrl = `/api/${storeId}/live/sales-events`; // Example endpoint path
    eventSourceRef.current = new EventSource(sseUrl);

    eventSourceRef.current.onmessage = (event) => {
      try {
        const newSale: SalesEvent = JSON.parse(event.data);
        setEvents((prevEvents) => {
          // Add new event and keep only the latest 'maxItems'
          const updatedEvents = [newSale, ...prevEvents];
          return updatedEvents.slice(0, maxItems);
        });
      } catch (error) {
        console.error("Failed to parse sales event:", error);
      }
    };

    eventSourceRef.current.onerror = (error) => {
      console.error("SSE Error:", error);
      // Optional: Implement reconnection logic or display an error state
      eventSourceRef.current?.close(); // Close on error to prevent constant retries by browser if endpoint is faulty
    };

    // Cleanup function to close connection when component unmounts
    return () => {
      eventSourceRef.current?.close();
    };
  }, [storeId, maxItems]); // Reconnect if storeId or maxItems changes

  return (
    <div className="overflow-hidden h-10 bg-gray-100 dark:bg-gray-800 rounded-md relative">
      <AnimatePresence initial={false}>
        {events.map((event, index) => (
          <motion.div
            key={event.id} // Use a unique ID from the event data
            className="absolute w-full flex items-center justify-between px-3 py-2 text-sm"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }} // Stagger animation slightly
            style={{ zIndex: events.length - index }} // Ensure newer items are on top briefly during transition
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-green-500" />
              <span>
                New Sale: {event.productName} ({formatter.format(event.value)})
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              {event.location && <MapPin className="h-4 w-4" />}
              {event.location && <span>{event.location}</span>}
              <span className="text-xs">
                {formatRelativeTime(event.timestamp)}
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {events.length === 0 && (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Waiting for sales data...
        </div>
      )}
    </div>
  );
};
