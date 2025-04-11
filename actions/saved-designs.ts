// This is no longer a server action itself, but a helper function called by API routes.
// Remove "use server"; directive if present at top.
// import { getServerSession } from "next-auth/next"; // No longer needed here
// import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // No longer needed here
import prismadb from "@/lib/prismadb";
import { revalidatePath } from "next/cache"; // To potentially refresh client-side data

// Define the structure of the return type for better type safety
interface ActionResult {
  success: boolean;
  error?: string;
  data?: { id: string; isShared: boolean }; // Return minimal necessary data
}

export async function updateSharingStatus(
  userId: string, // Add userId as the first argument
  designId: string,
  isShared: boolean
): Promise<ActionResult> {
  try {
    console.log(
      `[Server Action] Attempting to update sharing status for design ${designId} to ${isShared}`
    );

    // 1. userId is now passed as an argument, no need to get session here.
    // Basic validation of the passed userId (optional, but good practice)
    if (!userId || typeof userId !== "string") {
      console.error("[Server Action] Invalid userId passed:", userId);
      return { success: false, error: "Invalid user identifier provided." };
    }
    console.log(`[Server Action] Function called for user: ${userId}`);

    // 2. Validate input (basic check)
    if (!designId || typeof isShared !== "boolean") {
      console.error("[Server Action] Invalid input:", { designId, isShared });
      return { success: false, error: "Invalid input provided." };
    }

    // 3. Verify ownership and fetch necessary data
    const design = await prismadb.savedDesign.findUnique({
      where: { id: designId, userId: userId }, // Check both ID and ownership
      include: {
        // Include fields needed for derived product logic
        user: { select: { name: true } }, // Get creator name
        product: { select: { storeId: true, price: true, categoryId: true } }, // Get base product info
      },
    });

    if (!design) {
      console.error(
        `[Server Action] Design not found (ID: ${designId}) or user ${userId} not authorized.`
      );
      return { success: false, error: "Design not found or unauthorized" };
    }
    console.log(`[Server Action] Ownership verified for design ${designId}.`);

    // --- Derived Product Logic ---
    let derivedProductId = design.derivedProductId; // Keep track of the derived product ID

    if (isShared) {
      // --- Sharing the design ---
      console.log(`[Server Action] Sharing design ${designId}.`);
      if (design.derivedProductId) {
        // Derived product already exists, ensure it's unarchived
        console.log(
          `[Server Action] Derived product ${design.derivedProductId} exists. Unarchiving.`
        );
        await prismadb.product.update({
          where: { id: design.derivedProductId, savedDesignId: designId }, // Extra check
          data: { isArchived: false },
        });
        derivedProductId = design.derivedProductId; // Ensure it's set
      } else {
        // Derived product does not exist, create it
        console.log(
          `[Server Action] Entering block to create derived product for design ${designId}.`
        );
        if (
          !design.product ||
          !design.product.storeId ||
          !design.product.price ||
          !design.product.categoryId
        ) {
          console.error(
            `[Server Action] Cannot create derived product: Missing base product info for design ${designId}.`
          );
          return {
            success: false,
            error: "Base product information is missing.",
          };
        }

        const creatorName = design.user?.name || "Unknown Creator";
        const productName = `${
          design.description || "Custom Design"
        } by ${creatorName}`;
        try {
          console.log(`[Server Action] Preparing data for product creation...`);
          const productData = {
            storeId: design.product.storeId,
            categoryId: design.product.categoryId,
            name: productName,
            price: design.product.price,
            isFeatured: false,
            isArchived: false,
            sizeId: design.sizeId,
            colorId: design.colorId,
            savedDesignId: design.id,
            images: {
              create: [
                {
                  url:
                    design.mockupImageUrl ||
                    design.designImageUrl ||
                    "/placeholder.png",
                },
              ],
            },
          };
          console.log(
            "[Server Action] Product Data:",
            JSON.stringify(productData, null, 2)
          );

          const newProduct = await prismadb.product.create({
            data: productData,
          });
          derivedProductId = newProduct.id; // Store the new product ID
          console.log(
            `[Server Action] Successfully created derived product ${derivedProductId} for design ${designId}.`
          );
        } catch (createError) {
          console.error(
            `[Server Action] Error creating derived product for design ${designId}:`,
            createError
          );
          // Return an error, as we couldn't create the necessary product
          return {
            success: false,
            error: "Failed to create associated product listing.",
          };
        }
      }
    } else {
      // --- Unsharing the design ---
      console.log(`[Server Action] Unsharing design ${designId}.`);
      if (design.derivedProductId) {
        // Archive the associated derived product if it exists
        console.log(
          `[Server Action] Archiving derived product ${design.derivedProductId}.`
        );
        await prismadb.product.update({
          where: { id: design.derivedProductId, savedDesignId: designId }, // Extra check
          data: { isArchived: true },
        });
      } else {
        console.log(
          `[Server Action] No derived product found for design ${designId} to archive.`
        );
      }
    }
    // --- End Derived Product Logic ---

    // 4. Update the SavedDesign record itself (isShared status and derivedProductId if changed)
    const updateData: { isShared: boolean; derivedProductId?: string | null } =
      {
        isShared: isShared,
      };
    // Only include derivedProductId in the update if we are sharing and created a new one,
    // or if we are unsharing (to potentially clear it, though archiving is preferred).
    // The derivedProductId is set when a new product is created.
    if (
      isShared &&
      derivedProductId &&
      derivedProductId !== design.derivedProductId
    ) {
      updateData.derivedProductId = derivedProductId;
    }
    // If unsharing, we don't necessarily need to clear derivedProductId,
    // as the product is just archived. But you could add `updateData.derivedProductId = null;` here if desired.

    try {
      console.log(
        `[Server Action] Updating SavedDesign ${designId} with data:`,
        JSON.stringify(updateData, null, 2)
      );
      const updatedDesign = await prismadb.savedDesign.update({
        where: {
          id: designId,
          userId: userId, // Ensure ownership again
        },
        data: updateData,
        select: { id: true, isShared: true, derivedProductId: true }, // Select derivedProductId too for logging
      });
      console.log(
        `[Server Action] Successfully updated SavedDesign ${designId}. New derivedProductId: ${updatedDesign.derivedProductId}`
      );
      // Return only id and isShared as before for consistency
      return {
        success: true,
        data: { id: updatedDesign.id, isShared: updatedDesign.isShared },
      };
    } catch (updateError) {
      console.error(
        `[Server Action] Error updating SavedDesign ${designId} after product logic:`,
        updateError
      );
      // If product creation succeeded but this failed, we might have an orphaned product.
      // For now, return an error. More complex rollback logic could be added if needed.
      return { success: false, error: "Failed to update design linking." };
    }

    // This log is now potentially unreachable as the return happens inside the try/catch block
    // console.log(
    //   `[Server Action] Successfully updated design ${designId} sharing status to ${isShared}.`
    // );

    // 5. Optional: Revalidate relevant paths if data needs to be refreshed elsewhere
    // Example: If you have a page listing designs, revalidate it.
    // revalidatePath('/dashboard/my-designs');

    // // 6. Return success response - Moved inside the try/catch block above
    // return { success: true, data: updatedDesign };
  } catch (error) {
    console.error("[Server Action] Error updating sharing status:", error);
    // Avoid leaking detailed errors to the client
    return { success: false, error: "An internal server error occurred." };
  }
}
