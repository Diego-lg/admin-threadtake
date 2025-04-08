# Admin User Management Implementation Plan

This plan details the features and implementation steps required to manage user accounts from the `eccomerce-admin` dashboard. This complements the `USER_ACCOUNTS_PLAN.md` which focuses on general user functionality and the user-facing application.

**Assumptions:**

- The database schema changes outlined in `USER_ACCOUNTS_PLAN.md` (specifically the `User` model with a `role` field) are implemented or will be implemented.
- Admin role-based access control is in place (e.g., via `middleware.ts`) to protect these admin routes and APIs.

**Phase 1: Backend API Endpoints (Admin-Specific)**

Location: Likely within `app/api/admin/users/` or similar structure.

1.  **`GET /api/admin/users` (List Users):**

    - **Functionality:** Fetch a paginated list of all users. Allow filtering by `role` (USER, ADMIN) and `status` (Active, Inactive - requires adding a `status` field to the User model). Allow searching by `name` or `email`.
    - **Authorization:** Requires ADMIN role.
    - **Response:** Paginated list of user objects (excluding sensitive data like password hashes). Include `id`, `name`, `email`, `role`, `status`, `createdAt`.

2.  **`GET /api/admin/users/[userId]` (Get User Details):**

    - **Functionality:** Fetch detailed information for a specific user.
    - **Authorization:** Requires ADMIN role.
    - **Response:** Full user object (excluding sensitive data). Potentially include aggregated data like order count if needed later.

3.  **`PATCH /api/admin/users/[userId]` (Update User):**

    - **Functionality:** Update specific user fields, primarily `role` and `status`.
    - **Authorization:** Requires ADMIN role.
    - **Request Body:** `{ "role": "ADMIN", "status": "INACTIVE" }` (only include fields being changed).
    - **Response:** Updated user object.

4.  **`DELETE /api/admin/users/[userId]` (Delete User):**
    - **Functionality:** Permanently delete a user account. Consider implications for related data (orders, designs). A soft delete (setting `status` to `DELETED`) might be safer initially.
    - **Authorization:** Requires ADMIN role.
    - **Response:** Success message or 204 No Content.

**Phase 2: Frontend UI (Admin Dashboard)**

Location: Within `app/(dashboard)/[storeId]/(routes)/admin/users/` or similar.

1.  **Create New Route:** Set up the necessary page structure (`page.tsx`, potentially `layout.tsx`).
2.  **User List Component (`components/client.tsx`):**
    - Use `DataTable` (similar to other admin sections like Products, Categories).
    - Fetch data from `GET /api/admin/users`.
    - Implement columns (`components/columns.tsx`) to display user data (ID, Name, Email, Role, Status, Created At, Actions).
    - Include search input and potentially dropdown filters for Role and Status.
    - Implement pagination controls.
3.  **User Actions Component (`components/cell-action.tsx`):**
    - Add dropdown menu actions for each row:
      - "Edit Role" (Opens a modal or form).
      - "Change Status" (Activate/Deactivate - likely direct API call with confirmation).
      - "Delete" (API call with confirmation dialog).
      - "View Details" (Navigates to a user detail page - optional for initial implementation).
4.  **(Optional) User Detail Page:**
    - A separate page to display full user details fetched from `GET /api/admin/users/[userId]`.
    - Could include forms for editing details if more extensive editing is needed beyond role/status.
5.  **(Optional) Modals for Editing:**
    - Modals could be used for quick edits like changing the user role directly from the list view.

**Phase 3: Database Schema Update (If Needed)**

1.  **Add `status` field:** If not already present, add a `status` field to the `User` model in `prisma/schema.prisma`. An Enum `UserStatus { ACTIVE, INACTIVE, DELETED }` is recommended.

    ```prisma
    enum UserStatus {
      ACTIVE
      INACTIVE
      // Optional: Add DELETED for soft deletes
      // DELETED
    }

    model User {
      // ... other fields
      status UserStatus @default(ACTIVE)
      // ... other fields
    }
    ```

2.  **Run Migration:** `npx prisma migrate dev --name add_user_status`

**Implementation Notes:**

- Reuse existing UI components (`DataTable`, `Heading`, `Button`, `DropdownMenu`, `Modal`, `ApiAlert`) where possible to maintain consistency.
- Ensure robust error handling and user feedback (e.g., using `react-hot-toast`).
- Prioritize security: strictly enforce ADMIN role checks on all API routes and potentially on the frontend route access.
