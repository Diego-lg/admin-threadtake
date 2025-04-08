import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
// import EventEmitter from 'events'; // Or your preferred event bus/pubsub client

// --- Placeholder for Event Listening ---
// In a real application, this would subscribe to an event emitter or pub/sub system
// that gets notified when a new order is successfully processed.
// const salesEventEmitter = new EventEmitter(); // Example

// Example function to simulate receiving a new sale event
// Replace this with actual event listener logic
// function subscribeToSales(storeId: string, callback: (saleData: any) => void) {
//   const handler = (data: any) => {
//     if (data.storeId === storeId) { // Ensure event is for the correct store
//       callback(data.payload);
//     }
//   };
//   salesEventEmitter.on('new_sale', handler);
//   console.log(`SSE: Client subscribed for store ${storeId}`);
//   return () => {
//     salesEventEmitter.off('new_sale', handler);
//     console.log(`SSE: Client unsubscribed for store ${storeId}`);
//   };
// }

// --- SSE Route Handler ---

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } }
) {
  // Optional: Authenticate the request if needed
  // const session = await getServerSession(authOptions);
  // if (!session || !session.user) {
  //   return new NextResponse("Unauthenticated", { status: 401 });
  // }
  // // Optional: Verify user has access to this storeId
  // const hasAccess = verifyStoreAccess(session.user.id, params.storeId);
  // if (!hasAccess) {
  //    return new NextResponse("Unauthorized", { status: 403 });
  // }

  const { storeId } = params;
  if (!storeId) {
    return new NextResponse("Store ID is required", { status: 400 });
  }

  // Create a streaming response
  const stream = new ReadableStream({
    start(controller) {
      console.log(`SSE: Connection opened for store ${storeId}`);

      // --- Placeholder Event Sending Logic ---
      // The interval below is commented out to stop sending simulated data.
      // Replace this with your actual event listener logic when ready.
      /*
      const intervalId = setInterval(() => {
        // Simulate a new sale event
        const simulatedSale = {
          id: `order_${Date.now()}`,
          productName: "Sample T-Shirt",
          value: Math.random() * 100 + 10, // Random value
          location: "Anytown, USA",
          timestamp: Date.now(),
        };

        // Format the data according to SSE spec: "data: JSON_STRING\n\n"
        const message = `data: ${JSON.stringify(simulatedSale)}\n\n`;
        controller.enqueue(new TextEncoder().encode(message));
        console.log(`SSE: Sent event for store ${storeId}`);
      }, 5000);
      */
      let intervalId: NodeJS.Timeout | null = null; // Keep variable for cleanup logic if uncommented

      // --- Actual Event Listener Logic (Example Structure) ---
      // const unsubscribe = subscribeToSales(storeId, (saleData) => {
      //   try {
      //     // Format saleData into the structure expected by the frontend
      //     const formattedEvent = {
      //       id: saleData.orderId,
      //       productName: saleData.items[0]?.name || "Multiple Items",
      //       value: saleData.totalAmount,
      //       location: saleData.customerLocation, // If available
      //       timestamp: saleData.createdAt || Date.now(),
      //     };
      //     const message = `data: ${JSON.stringify(formattedEvent)}\n\n`;
      //     controller.enqueue(new TextEncoder().encode(message));
      //     console.log(`SSE: Sent real event for store ${storeId}`);
      //   } catch (e) {
      //      console.error("SSE: Error processing real event", e);
      //   }
      // });

      // Handle client disconnect
      req.signal.onabort = () => {
        console.log(`SSE: Connection closed for store ${storeId}`);
        if (intervalId) clearInterval(intervalId); // Stop sending simulated events if interval exists
        // unsubscribe?.(); // Clean up the actual event listener
        controller.close();
      };
    },
    cancel() {
      console.log(`SSE: Stream cancelled for store ${storeId}`);
      // Clean up resources if needed when the stream is cancelled
    },
  });

  // Return the stream with appropriate headers
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
