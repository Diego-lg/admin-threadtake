# Plan: Unique Products for Marketplace Designs

**Goal:** Allow each shared `SavedDesign` to function as a distinct product listing in the marketplace, resolving the issue where all designs link to the same base product template.

**Approach:** Create a dedicated `Product` record in the database whenever a `SavedDesign` is marked for sharing (`isShared = true`).

**Detailed Steps:**

1.  **Database Schema Modification (`prisma/schema.prisma`):**

    - Add fields to link a `Product` back to the `SavedDesign` it represents, and vice-versa.

    ```prisma
    // Add to Product model
    savedDesignId String? @unique // Optional: Link to the SavedDesign this product represents
    savedDesign   SavedDesign? @relation(name: "ProductForDesign", fields: [savedDesignId], references: [id], onDelete: SetNull, onUpdate: Cascade) // Optional relation back

    // Add to SavedDesign model
    derivedProductId String? @unique // Optional: Link to the Product created specifically for this design when shared
    derivedProduct   Product? @relation(name: "ProductForDesign", fields: [derivedProductId], references: [id], onDelete: SetNull, onUpdate: Cascade) // Optional relation
    ```

    - Run `npx prisma migrate dev --name add_product_design_link` to apply changes.

2.  **Backend Logic Modification (`actions/saved-designs.ts`):**

    - Enhance the `updateSharingStatus` server action:
      - **When `isShared` becomes `true`:**
        - Check if a `derivedProduct` already exists for this `SavedDesign` (using `derivedProductId`). If yes, ensure it's unarchived (`isArchived: false`).
        - If no `derivedProduct` exists:
          - Fetch the base `Product` details using `savedDesign.productId`.
          - Fetch the `SavedDesign` details (including creator info, description, mockup image).
          - Create a _new_ `Product` record:
            - Copy relevant base info (`storeId`, `categoryId`).
            - Set a dynamic `name` (e.g., `"${design.description || 'Custom Design'}" by ${creatorName}`).
            - Set the `price` (Use base product price for now).
            - Set `isArchived: false`, `isFeatured: false`.
            - Set `savedDesignId` to the ID of the current `SavedDesign`.
            - Create an `Image` record associated with this new product using the `savedDesign.mockupImageUrl`.
            - Use the specific `sizeId` and `colorId` from the `SavedDesign` for this new product record.
          - Update the `SavedDesign` record to store the ID of the newly created product in its `derivedProductId` field.
      - **When `isShared` becomes `false`:**
        - Find the associated `derivedProduct` using `savedDesign.derivedProductId`.
        - If found, update the `derivedProduct` to set `isArchived: true`.

3.  **Backend API Modification (Marketplace & Design Detail):**

    - **Marketplace Endpoint (e.g., `/api/marketplace` - needs creation or modification):** This endpoint should query the `Product` table, filtering for products where `savedDesignId` is _not null_ and `isArchived` is _false_. Include related data (images, creator, rating).
    - **Design Detail Endpoint (`GET /api/designs/[designId]`):** Modify the existing `GET` handler in `app/api/designs/[designId]/route.ts`. When fetching a `SavedDesign`, check if `isShared` is true and `derivedProductId` exists.
      - If yes, fetch the _derived_ product's details and embed them in the `product` field of the response.
      - If no, fetch the _base_ product's details (using `savedDesign.productId`).

4.  **Frontend Modification (`treadheaven-storefront`):**
    - Update the marketplace page to fetch data from the new/modified marketplace API endpoint.
    - The design detail page should require minimal changes if the backend API provides the correct product info.
    - Ensure "Add to Cart" uses the `derivedProductId` for marketplace items.

**Diagram:**

```mermaid
graph TD
    subgraph Database Schema (After Changes)
        User -- creates --> SD(SavedDesign)
        SD -- links to (productId) --> BaseProd(Product)
        SD -- can generate --> DerivedProd(Product) {style DerivedProd fill:#ccf,stroke:#333}
        DerivedProd -- represents (savedDesignId) --> SD
        SD -- links to (derivedProductId) --> DerivedProd

        BaseProd[Base Product<br/>(e.g., T-Shirt Template)]
        DerivedProd[Derived Product<br/>(Represents Shared Design)]
    end

    subgraph Backend Logic Changes
        UpdateShareAction(actions/updateSharingStatus)
        UpdateShareAction -- If isShared=true & no DerivedProd --> CreateDerived[Creates Derived Product Record]
        CreateDerived -- links --> SD[Updates SD.derivedProductId]
        UpdateShareAction -- If isShared=false --> ArchiveDerived[Sets DerivedProd.isArchived = true]

        MarketplaceAPI(GET /api/marketplace) -- queries --> DerivedProd
        DesignDetailAPI(GET /api/designs/[id]) -- fetches --> SD
        DesignDetailAPI -- If Shared --> EmbedsDerived(Embeds Derived Product Data)
        DesignDetailAPI -- Else --> EmbedsBase(Embeds Base Product Data)
    end

    subgraph Frontend Logic Changes
        MarketplacePage -- uses --> MarketplaceAPI
        DesignDetailPage -- uses --> DesignDetailAPI
        AddToCart -- uses --> CorrectProductID{Uses Derived Product ID for shared items}
    end
```

**Decisions:**

- **Pricing:** Use the base product's price for derived products (for now).
- **Activation:** Derived product creation/activation is triggered when `isShared` is set to `true` via the `updateSharingStatus` action.
