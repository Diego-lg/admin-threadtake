import React from "react";

import { ApiList } from "@/components/ui/api-list";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";

const ApiSettingsPage = () => {
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <Heading
          title="API Settings"
          description="Manage your API keys and settings."
        />
        <Separator />
        {/* TODO: Add API key generation/management UI here */}
        <p className="text-sm text-muted-foreground">
          Below are the API endpoints for your store resources.
        </p>
        {/* Categories API List */}
        <Heading
          title="Categories"
          description="API calls for Categories"
        />{" "}
        {/* Removed invalid props */}
        <Separator />
        <ApiList entityName="categories" entityIdName="categoryId" />
        {/* Products API List */}
        <Heading title="Products" description="API calls for Products" />{" "}
        {/* Removed invalid props */}
        <Separator />
        <ApiList entityName="products" entityIdName="productId" />
        {/* TODO: Add other relevant API endpoints (Billboards, Orders, etc.) */}
        {/* Colors API List */}
        <Heading title="Colors" description="API calls for Colors" />
        <Separator />
        <ApiList entityName="colors" entityIdName="colorId" />
        {/* Sizes API List */}
        <Heading title="Sizes" description="API calls for Sizes" />
        <Separator />
        <ApiList entityName="sizes" entityIdName="sizeId" />
      </div>
    </div>
  );
};

export default ApiSettingsPage;
