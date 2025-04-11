import { format } from "date-fns";
import { Prisma } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatter } from "@/lib/utils"; // Assuming you have a currency formatter

// Define the expected type for the orders prop, including nested relations
type OrderWithItemsAndProducts = Prisma.OrderGetPayload<{
  include: {
    orderItems: {
      include: {
        product: {
          select: { name: true; price: true };
        };
      };
    };
  };
}>;

interface UserOrdersListProps {
  orders: OrderWithItemsAndProducts[];
}

export const UserOrdersList: React.FC<UserOrdersListProps> = ({ orders }) => {
  if (!orders || orders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This user has not placed any orders yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate total spent across all orders shown
  const totalSpent = orders.reduce((total, order) => {
    const orderTotal = order.orderItems.reduce((orderSum, item) => {
      // Ensure price is treated as a number
      const price =
        typeof item.product.price === "number"
          ? item.product.price
          : parseFloat(item.product.price.toString()); // Convert Decimal to number
      return orderSum + (isNaN(price) ? 0 : price);
    }, 0);
    return total + orderTotal;
  }, 0);

  return (
    <Card className="col-span-1 md:col-span-3">
      {" "}
      {/* Make it span full width on larger screens */}
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Order History ({orders.length})</CardTitle>
          <div className="text-sm text-muted-foreground">
            Total Spent:{" "}
            <span className="font-semibold">
              {formatter.format(totalSpent)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {orders.map((order) => (
          <div key={order.id} className="border p-4 rounded-md space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold">
                Order ID: {order.id.substring(0, 8)}...
              </span>
              <span className="text-muted-foreground">
                {format(order.createdAt, "MMMM do, yyyy")}
              </span>
              <Badge variant={order.isPaid ? "default" : "secondary"}>
                {" "}
                {/* Use default for Paid */}
                {order.isPaid ? "Paid" : "Not Paid"}
              </Badge>
            </div>
            <Separator />
            <ul className="space-y-1 text-xs list-disc list-inside">
              {order.orderItems.map((item) => (
                <li key={item.id}>
                  {item.product.name} -{" "}
                  {formatter.format(Number(item.product.price))}
                </li>
              ))}
            </ul>
            {/* Display address/phone if available */}
            {(order.address || order.phone) && (
              <div className="text-xs text-muted-foreground pt-1">
                {order.address && <span>Address: {order.address}</span>}
                {order.address && order.phone && <span> | </span>}
                {order.phone && <span>Phone: {order.phone}</span>}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
