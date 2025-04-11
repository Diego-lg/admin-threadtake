# Plan: Implement Sales Ticker & Goal Tracking Features

This plan details the implementation steps for the 'Real-time Sales Ticker' and 'Goal Tracking & Pacing' features for the E-commerce Store Owner dashboard.

**1. Real-time Sales Ticker**

- **Objective:** Display a live, scrolling feed of recent sales events to provide an immediate sense of activity.
- **Data Requirements:** For each sale event:
  - Order ID (for potential drill-down)
  - Primary Product Name/Image (or indication of multiple items)
  - Order Value (formatted currency)
  - Timestamp (relative time, e.g., "1 min ago")
  - Customer Location (City/State/Country - optional, privacy permitting)
- **Implementation Approach:**
  - **Backend:** Needs a mechanism to push new order events to connected clients. Options:
    - **WebSockets:** Most suitable for true real-time, bidirectional communication. Requires a WebSocket server setup.
    - **Server-Sent Events (SSE):** Simpler, unidirectional (server-to-client) push. Good fit if only server events are needed. Requires an SSE endpoint.
    - **Polling (Less Ideal):** Frontend periodically asks the backend for new orders. Less "real-time", can be inefficient.
  - **Frontend:**
    - Connect to the chosen backend mechanism (WebSocket/SSE/Polling endpoint).
    - Receive new order events.
    - Update a state array holding the last N ticker items.
    - Render the items in a scrolling list/ticker component.
- **UI Component:**
  - A dedicated `<SalesTicker />` component.
  - Displays a list of `<TickerItem />` components.
  - Handles the connection logic and state management for ticker items.
  - Uses CSS animations or a library for smooth scrolling/transitions.
- **API/Events:**
  - **WebSocket/SSE Endpoint:** `/api/live/sales-events` (example) - Streams new order data.
  - _(If Polling)_: `/api/orders/recent?limit=5` (example) - Fetches the latest few orders.

**2. Goal Tracking & Pacing**

- **Objective:** Allow owners to set sales goals and visualize progress against them, including whether they are on pace to meet the goal.
- **Data Requirements:**
  - **Goal Definition:**
    - Goal ID
    - Metric Type (`revenue`, `units_sold`)
    - Target Value (numeric)
    - Time Period (`daily`, `weekly`, `monthly`)
    - Start/End Dates (calculated or stored)
    - Store ID association
  - **Progress Data:**
    - Current accumulated value for the metric within the goal's period (e.g., MTD revenue).
- **Implementation Approach:**
  - **Backend:**
    - **Goal Storage:** Need a new database model (e.g., `SalesGoal`) to store goal definitions.
    - **API Endpoints:**
      - `POST /api/[storeId]/sales-goals`: Create/update goals.
      - `GET /api/[storeId]/sales-goals?period=monthly`: Fetch active goals for a period.
      - `GET /api/[storeId]/sales-progress?goalId=...`: Fetch current progress for a specific goal (requires calculating sum of orders within the period). This might be combined with the goal fetching endpoint.
  - **Frontend:**
    - **Goal Setting UI:** A section (perhaps in "Settings" or on the main dashboard) to define/edit goals.
    - **Goal Display Component:** `<GoalTracker />` component(s) on the dashboard.
      - Fetches active goals and their progress via the API.
      - Calculates percentage complete.
      - Calculates pacing: `(Current Progress / Elapsed Time Fraction) vs. Target Value`. (e.g., If halfway through the month, are you at least halfway to the target?).
      - Displays progress visually (e.g., progress bar) and pacing status (e.g., "On Pace", "Behind", "Ahead").
- **UI Component:**
  - `<GoalTracker />`: Takes goal definition and progress data as props.
  - Displays Goal Label (e.g., "Monthly Revenue Goal").
  - Displays Target Value and Current Progress.
  - Visual Progress Bar (`<Progress />` component from UI library).
  - Pacing Indicator (text or icon).
- **Database:**
  - New `SalesGoal` table/model: `id`, `storeId`, `metricType`, `targetValue`, `timePeriod`, `createdAt`, `updatedAt`.

**Visualization:**

```mermaid
graph TD
    subgraph Feature: Real-time Sales Ticker
        A[UI: <SalesTicker />] --> B{Frontend Logic: Connect & Update State}
        B --> C{Backend: Event Source};
        C -- Push Event --> B;
        subgraph Backend Event Source Options
            C1[WebSocket Server]
            C2[Server-Sent Events Endpoint]
            C3[Polling API Endpoint (Less Ideal)]
        end
        C --> C1 & C2 & C3;
        D[DB: Orders Table] --> C;
    end

    subgraph Feature: Goal Tracking & Pacing
        E[UI: <GoalTracker />] --> F{Frontend Logic: Fetch Data & Calculate Pacing};
        F --> G[API: GET /sales-goals];
        F --> H[API: GET /sales-progress];
        G --> I[DB: SalesGoal Table];
        H --> J[DB: Orders Table (for aggregation)];
        K[UI: Goal Setting Form] --> L{Frontend Logic: Save Goal};
        L --> M[API: POST /sales-goals];
        M --> I;
    end

    A & E --> N[Dashboard Page]

```

**Summary:**

- **Sales Ticker:** Requires a real-time backend mechanism (WebSocket/SSE preferred) and a frontend component to display streamed order data.
- **Goal Tracking:** Requires database storage for goals, API endpoints to manage and query goals/progress, and frontend components for setting and displaying goal status with pacing calculations.
