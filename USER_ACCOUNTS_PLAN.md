# User Account Functionality Implementation Plan

This plan outlines the steps to implement user accounts, saved designs, and order history for the e-commerce application.

**Strategy:** Leverage and extend the existing backend infrastructure in the `eccomerce-admin` project first, followed by frontend implementation in the separate user-facing application.

**Phase 1: Backend Enhancement (in `eccomerce-admin` project)**

1.  **Update Database Schema (`prisma/schema.prisma`):**

    - **Add User Roles:** Modify the `User` model to include a `role` field (e.g., using an Enum `UserRole { USER, ADMIN }`).
    - **Create `SavedDesign` Model:** Define fields for `userId`, `productId`, `colorId`, `sizeId`, `customText`, and relations to `User`, `Product`, `Color`, `Size`.
    - **Link Orders to Users:** Add `userId` field and relation to the `Order` model.

2.  **Implement Role Handling:**

    - **Registration:** Modify `app/api/register/route.ts` to assign a default role (`USER`).
    - **Authentication Logic:** Update `next-auth` configuration to include the user's role in the session/JWT.
    - **Authorization:** Update `middleware.ts` or route handlers for admin-only access control.

3.  **Create `SavedDesign` API Endpoints:**

    - `POST /api/designs` (Create)
    - `GET /api/designs` (Read List - User's own)
    - `DELETE /api/designs/[designId]` (Delete - User's own)

4.  **Create Order History API Endpoint:**

    - `GET /api/orders` (Read List - User's own)

5.  **Database Migration:** Run `npx prisma migrate dev` to apply schema changes.

**Phase 2: Frontend Implementation (in the separate User Frontend project)**

_Assume the `eccomerce-admin` backend is running and accessible._

1.  **Setup Authentication:** Configure `next-auth` client to use the backend's endpoints.
2.  **Registration Page:** Build UI and call `POST /api/register`.
3.  **Login Page:** Build UI and use `signIn()`.
4.  **"Save Design" Functionality:** Build UI and call `POST /api/designs`.
5.  **"My Designs" Page:** Build UI, fetch from `GET /api/designs`, implement delete via `DELETE /api/designs/[designId]`.
6.  **"Order History" Page:** Build UI, fetch from `GET /api/orders`.
7.  **User Profile/Account Area:** Display user info and navigation.

**Visual Plan (Mermaid Diagram):**

```mermaid
graph TD
    A[Phase 1: Backend (eccomerce-admin)] --> B{DB Schema Update};
    B --> B1[Add User.role Enum/Field];
    B --> B2[Add SavedDesign Model];
    B --> B3[Add Order.userId Field];
    A --> C{Auth Logic Update};
    C --> C1[Register: Default Role];
    C --> C2[NextAuth: Add Role to Session];
    C --> C3[Middleware: Role Checks];
    A --> D{API Endpoints};
    D --> D1[CRUD for /api/designs];
    D --> D2[GET /api/orders (User-specific)];
    A --> E[DB Migration];

    F[Phase 2: Frontend (User App)] --> G{Auth Setup};
    G --> G1[Configure NextAuth Client];
    F --> H{UI Pages/Components};
    H --> H1[Register Page --> Calls POST /api/register];
    H --> H2[Login Page --> Uses signIn()];
    H --> H3[Save Design UI --> Calls POST /api/designs];
    H --> H4[My Designs Page --> Calls GET/DELETE /api/designs];
    H --> H5[Order History Page --> Calls GET /api/orders];
    H --> H6[User Profile Area];

    subgraph eccomerce-admin Backend
        direction LR
        B1 -- defines --> User;
        B2 -- defines --> SavedDesign;
        B3 -- defines --> Order;
        User -- has many --> SavedDesign;
        User -- has many --> Order;
        Product -- used in --> SavedDesign;
        Color -- used in --> SavedDesign;
        Size -- used in --> SavedDesign;
        C1 -- uses --> User;
        C2 -- uses --> User;
        C3 -- checks --> User.role;
        D1 -- operates on --> SavedDesign;
        D2 -- operates on --> Order;
        E -- applies changes --> User & SavedDesign & Order;
    end

    subgraph User Frontend App
        direction LR
        G1 -- enables --> H2 & H6;
        H1 -- interacts with --> D1_Backend(POST /api/register);
        H2 -- interacts with --> C2_Backend(NextAuth Endpoints);
        H3 -- interacts with --> D1_Backend_POST(POST /api/designs);
        H4 -- interacts with --> D1_Backend_GET(GET /api/designs) & D1_Backend_DELETE(DELETE /api/designs);
        H5 -- interacts with --> D2_Backend(GET /api/orders);
    end

    D1 --> D1_Backend & D1_Backend_POST & D1_Backend_GET & D1_Backend_DELETE;
    D2 --> D2_Backend;
    C1 --> D1_Backend;
    C2 --> C2_Backend;

    classDef backend fill:#f9f,stroke:#333,stroke-width:2px;
    classDef frontend fill:#ccf,stroke:#333,stroke-width:2px;
    class A,B,C,D,E,User,SavedDesign,Order,Product,Color,Size backend;
    class F,G,H,H1,H2,H3,H4,H5,H6 frontend;
```
