"use client";

import * as z from "zod";
import { Product, Category, Color, Image, Size } from "@prisma/client";
import { Heading } from "@/components/ui/heading";
import { Button } from "@/components/ui/button";
// Removed Trash import as delete is not needed
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import {
  Form,
  FormControl,
  FormDescription, // Keep if needed for other fields
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
// Removed AlertModal import
import ImageUpload from "@/components/ui/image-upload";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
// Removed Checkbox import

// Schema remains largely the same, but featured/archived are handled programmatically
const formSchema = z.object({
  name: z.string().min(1),
  images: z
    .object({ url: z.string() })
    .array()
    .min(1, "At least one image is required."), // Ensure at least one image
  price: z.coerce.number().min(1),
  categoryId: z.string().min(1),
  // colorId removed from schema
  // sizeId removed from schema
  // isFeatured and isArchived removed from schema as they are not user-editable here
});

type GeneratorBaseFormValues = z.infer<typeof formSchema>;

interface GeneratorBaseFormProps {
  initialData:
    | (Product & {
        images: Image[];
      })
    | null;
  categories: Category[];
  // colors prop removed
  // sizes prop removed
}

export const GeneratorBaseForm: React.FC<GeneratorBaseFormProps> = ({
  initialData,
  categories,
  // colors prop removed
  // sizes prop removed
}) => {
  const params = useParams();
  const router = useRouter();
  // Removed 'open' state for delete modal
  const [loading, setLoading] = useState(false);

  // Adjust titles and descriptions for the generator base product context
  const title = initialData
    ? "Edit Generator Base Product"
    : "Create Generator Base Product";
  const description = initialData
    ? "Edit the default product used by the generator."
    : "Create the default product for the generator.";
  const toastMessage = initialData
    ? "Generator base product updated."
    : "Generator base product created.";
  const action = initialData ? "Save changes" : "Create";

  const form = useForm<GeneratorBaseFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          price: parseFloat(String(initialData?.price)),
          images: initialData.images || [], // Ensure images is always an array
          // colorId removed from defaultValues
        }
      : {
          name: "",
          images: [],
          price: 0,
          categoryId: "", // Ensure default categoryId is handled if needed
          // colorId removed
          // sizeId removed
          // isFeatured and isArchived are not needed in default values
        },
  });

  const onSubmit = async (data: GeneratorBaseFormValues) => {
    try {
      setLoading(true);

      // Ensure isFeatured and isArchived are always false for the base product
      const submissionData = {
        ...data,
        isFeatured: false,
        isArchived: false,
      };

      if (initialData) {
        // Update existing base product
        await axios.patch(
          `/api/${params.storeId}/products/${initialData.id}`,
          submissionData
        );
      } else {
        // Create new base product
        await axios.post(`/api/${params.storeId}/products`, submissionData);
      }
      router.refresh(); // Refresh current page to show updated data
      // No need to push router, stay on the same page
      toast.success(toastMessage);
    } catch (error) {
      console.error("Generator Base Form Submission Error:", error);
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Removed onDelete function

  return (
    <>
      {/* Removed AlertModal */}
      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
        {/* Removed Delete Button */}
      </div>

      <Separator />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 w-full"
        >
          <FormField
            control={form.control}
            name="images"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Images</FormLabel>
                <FormControl>
                  <ImageUpload
                    value={field.value.map((image) => image.url)}
                    disabled={loading}
                    onChange={
                      (url) => field.onChange([...(field.value || []), { url }]) // Ensure field.value is array
                    }
                    onRemove={(url) =>
                      field.onChange([
                        ...(field.value || []).filter(
                          (current) => current.url !== url
                        ), // Ensure field.value is array
                      ])
                    }
                  />
                </FormControl>
                <FormMessage /> {/* Shows validation error if no images */}
              </FormItem>
            )}
          />
          <div className="grid grid-cols-3 gap-8">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Base product name (e.g., Basic T-Shirt)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="9.99"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a Category"
                        ></SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Size FormField removed */}
            {/* Color FormField removed */}
            {/* Removed isFeatured and isArchived Checkboxes */}
          </div>

          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
