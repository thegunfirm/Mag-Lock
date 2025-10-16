import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IHOrderPanel } from "@/components/ih-order-panel";
import { formatPrice } from "@/lib/pricing-utils";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Package, Calendar, DollarSign, User, MapPin, Clock, AlertCircle } from "lucide-react";

export default function AdminOrderDetailPage() {
  const [, params] = useRoute("/admin/order/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const orderId = params?.id;

  // Check if user is admin/staff
  const isStaff = ['admin', 'manager', 'support'].includes(user?.role || '');

  // Fetch order summary with IH details
  const { data: orderSummary, isLoading, error, refetch } = useQuery({
    queryKey: [`/api/orders/${orderId}/summary`],
    enabled: !!orderId && isStaff
  });

  // Fetch full order details
  const { data: orderDetails } = useQuery({
    queryKey: [`/api/orders/${orderId}`],
    enabled: !!orderId && isStaff
  });

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to access this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <Skeleton className="h-12 w-64" />
            <Skeleton className="h-96" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !orderSummary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load order details. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const order = { ...orderSummary, ...orderDetails };
  const orderItems = orderDetails?.items || [];
  
  // Check if this is an IH order by checking fulfillmentGroups
  let isIHOrder = false;
  
  // First check fulfillmentType directly (for backward compatibility)
  if (orderSummary.fulfillmentType === 'ih_ffl') {
    isIHOrder = true;
  } else if (order.fulfillmentGroups) {
    // Parse fulfillmentGroups if it's a string
    let fulfillmentGroups = [];
    if (typeof order.fulfillmentGroups === 'string') {
      try {
        fulfillmentGroups = JSON.parse(order.fulfillmentGroups);
      } catch (e) {
        console.error('Failed to parse fulfillmentGroups:', e);
      }
    } else {
      fulfillmentGroups = order.fulfillmentGroups;
    }
    
    // Check if any group has ih_ffl type
    isIHOrder = fulfillmentGroups.some((group: any) => group.fulfillmentType === 'ih_ffl');
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'shipped':
        return 'bg-indigo-100 text-indigo-800';
      case 'delivered':
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/cms/admin/orders-management")}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Orders
            </Button>
            
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Order #{order.orderId}</h1>
                <p className="text-gray-600 mt-2">
                  Order placed on {format(parseISO(order.orderDate), 'MMMM dd, yyyy')}
                </p>
              </div>
              <Badge className={`gap-1 ${getStatusColor(order.status)}`}>
                {order.status}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content - 2 columns */}
            <div className="lg:col-span-2 space-y-6">
              {/* Order Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Order Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{item.description || item.name}</p>
                              {item.mpn && (
                                <p className="text-sm text-gray-500">MPN: {item.mpn}</p>
                              )}
                              {item.upc && (
                                <p className="text-sm text-gray-500">UPC: {item.upc}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{formatPrice(parseFloat(item.price))}</TableCell>
                          <TableCell className="font-medium">
                            {formatPrice(parseFloat(item.price) * item.quantity)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* IH Order Panel - Only show for IH orders */}
              {isIHOrder && (
                <IHOrderPanel 
                  order={order} 
                  onUpdate={() => refetch()} 
                />
              )}

              {/* Activity Logs */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Activity Log
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96">
                    <div className="space-y-4">
                      {orderSummary.activityLogs?.map((log: any) => (
                        <div key={log.id} className="border-b pb-3 last:border-0">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <Badge 
                                variant="outline" 
                                className={`mb-2 ${
                                  log.eventStatus === 'success' ? 'text-green-600' :
                                  log.eventStatus === 'failed' ? 'text-red-600' :
                                  log.eventStatus === 'warning' ? 'text-yellow-600' :
                                  'text-gray-600'
                                }`}
                              >
                                {log.eventType.replace(/_/g, ' ')}
                              </Badge>
                              <p className="text-sm font-medium">{log.description}</p>
                              {log.details && (
                                <div className="mt-2 text-xs text-gray-600">
                                  {log.details.adminUser && (
                                    <p>By: {log.details.adminUser}</p>
                                  )}
                                  {log.details.previousStatus && (
                                    <p>From: {log.details.previousStatus} → {log.details.newStatus}</p>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 ml-4">
                              {format(parseISO(log.createdAt), 'MMM dd, HH:mm')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar - 1 column */}
            <div className="space-y-6">
              {/* Order Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Order Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Subtotal</span>
                    <span className="font-medium">{formatPrice(parseFloat(order.totalPrice))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Shipping</span>
                    <span className="font-medium">Calculated at checkout</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-lg">{formatPrice(parseFloat(order.totalPrice))}</span>
                    </div>
                  </div>
                  {order.paymentMethod && (
                    <div className="pt-3 border-t">
                      <p className="text-sm text-gray-600">Payment Method</p>
                      <p className="font-medium capitalize">{order.paymentMethod}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Customer Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Customer Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="font-medium">{orderDetails?.customerName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium">{orderDetails?.customerEmail || 'N/A'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Shipping Address */}
              {orderDetails?.shippingAddress && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      Shipping Address
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm space-y-1">
                      {(() => {
                        const address = typeof orderDetails.shippingAddress === 'string' 
                          ? JSON.parse(orderDetails.shippingAddress)
                          : orderDetails.shippingAddress;
                        return (
                          <>
                            <p>{address.street}</p>
                            <p>{address.city}, {address.state} {address.zipCode}</p>
                            <p>{address.country || 'USA'}</p>
                          </>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Order Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Order Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600">Current Status</p>
                      <Badge className={`mt-1 ${getStatusColor(order.status)}`}>
                        {order.status}
                      </Badge>
                    </div>
                    {order.holdReason && (
                      <div>
                        <p className="text-sm text-gray-600">Hold Reason</p>
                        <p className="font-medium text-amber-600">{order.holdReason}</p>
                      </div>
                    )}
                    {order.capturedAt && (
                      <div>
                        <p className="text-sm text-gray-600">Payment Captured</p>
                        <p className="font-medium">
                          {format(parseISO(order.capturedAt), 'MMM dd, yyyy HH:mm')}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}