# Plan: Create "Marketplace Products" Admin Section

This plan outlines the steps to create a dedicated section within the admin dashboard (`eccomerce-admin`) for managing products generated from user designs (Marketplace products), separate from the standard store products.

## 1. New Dashboard Route

- **Action:** Create a new directory structure: `app/(dashboard)/[storeId]/(routes)/marketplace-products/`
- **Purpose:** This route will house the user interface for managing these specific products.

## 2. Dedicated API Endpoint

- **Action:** Create a new API route file: `app/api/[storeId]/marketplace-products/route.ts`
- **Functionality:**
  - The `GET` handler in this file will fetch `Product` records specifically linked to user designs (where `savedDesignId` is _not_ `null`).
  - It should include relevant related data like the `SavedDesign` (for creator info, design image, shared status), `color`, `size`, etc.

## 3. Frontend Page Implementation

- **Location:** `app/(dashboard)/[storeId]/(routes)/marketplace-products/`
- **Components:**
  - `page.tsx`: The main page component.
  - `components/client.tsx`: Handles data fetching (using the new API endpoint) and renders the data table.
  - `components/columns.tsx`: Defines the columns for the table (e.g., Product Name, Creator, Design Image, Price, Shared Status, Date Created).
- **Goal:** Mirror the structure of the existing `products` section but display data from the new API endpoint and use the new column definitions.

## 4. Update Navigation

- **File:** `components/main-nav.tsx`
- **Action:** Add a new entry to the `routes` array:
  ```javascript
  {
    href: `/${params.storeId}/marketplace-products`,
    label: "Marketplace", // Or "Marketplace Products"
    active: pathname === `/${params.storeId}/marketplace-products`,
  }
  ```
- **Result:** Adds a "Marketplace" link to the main dashboard navigation.

## Visualization

```mermaid
graph TD
    subgraph Admin Dashboard UI (app/(dashboard)/[storeId]/(routes))
        A[page.tsx (Overview)]
        B[products/page.tsx]
        C[categories/page.tsx]
        D[orders/page.tsx]
        E[settings/page.tsx]
        F[...other sections]
        G[marketplace-products/page.tsx] --- H(components/client.tsx)
        H --- I(components/columns.tsx)
    end

    subgraph Admin API (app/api/[storeId])
        J[products/route.ts] --> K{DB: Product (savedDesignId IS NULL)}
        L[marketplace-products/route.ts] --> M{DB: Product (savedDesignId IS NOT NULL)}
        N[...other API routes]
    end

    subgraph Navigation (components/main-nav.tsx)
        O[routes array] --> P{Link: /.../products}
        O --> Q{Link: /.../categories}
        O --> R{Link: /.../marketplace-products}
        O --> S{...other links}
    end

    H --> L -- Fetches data --> M
    B --> J -- Fetches data --> K
    R --> G
```

## Key Outcomes

- Clear separation between manually added store products and user-generated marketplace products in the admin dashboard.
- A dedicated view optimized for managing marketplace items, potentially showing relevant details like creator and shared status.
