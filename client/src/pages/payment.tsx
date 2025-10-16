import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CreditCard, Shield, CheckCircle, Star, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { SubscriptionEnforcement } from "@/components/auth/subscription-enforcement";
import { apiRequest } from "@/lib/queryClient";
import { finalizeOrder } from "@/lib/finalizeOrder";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const paymentSchema = z.object({
  cardNumber: z.string().min(15, "Card number must be at least 15 digits").max(19, "Card number must be at most 19 digits"),
  expirationMonth: z.string().min(2, "Month required"),
  expirationYear: z.string().min(2, "Year required"),
  cardCode: z.string().min(3, "CVV must be at least 3 digits").max(4, "CVV must be at most 4 digits"),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

const formatPrice = (price: number | string) => {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return `$${numPrice.toFixed(2)}`;
};

// Final Urgency Upgrade Benefits Component  
function FinalUpgradeBenefits({ user }: { user: any }) {
  const { getTotalPrice } = useCart();
  const [, setLocation] = useLocation();
  
  if (!user) return null;

  const currentTier = user.membershipTier || 'bronze';
  const totalPrice = getTotalPrice();
  
  const bronzeDiscount = 0;
  const goldDiscount = 0.05;
  const platinumDiscount = 0.15;
  
  const currentSavings = currentTier === 'platinum' ? totalPrice * platinumDiscount :
                        currentTier === 'gold' ? totalPrice * goldDiscount : 0;
  
  const potentialSavings = totalPrice * platinumDiscount;
  const additionalSavings = potentialSavings - currentSavings;

  if (isNaN(totalPrice) || isNaN(currentSavings) || isNaN(potentialSavings) || isNaN(additionalSavings)) {
    return null;
  }

  const handleUpgrade = () => {
    sessionStorage.setItem('checkout_return_url', '/payment');
    setLocation('/membership');
  };

  if (currentTier === 'platinum') {
    return (
      <Alert className="bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200 mb-6">
        <Star className="w-4 h-4 text-amber-600" />
        <AlertDescription className="text-amber-800">
          <div className="flex items-center justify-between">
            <span>
              <strong>Platinum Member Benefits:</strong> You're saving <span className="font-bold text-red-600">{formatPrice(currentSavings)}</span> on this order!
            </span>
            <Badge className="bg-amber-100 text-amber-800 border-amber-300">
              Premium Member
            </Badge>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="bg-gradient-to-r from-red-100 to-red-200 border-red-500 border-3 mb-6 shadow-xl">
      <AlertTriangle className="w-5 h-5 text-red-700 animate-pulse" />
      <AlertDescription className="text-red-900">
        <div className="text-center py-3">
          <div className="text-xl font-bold text-red-800 mb-2">
            🚨 FINAL CHANCE TO SAVE! 🚨
          </div>
          <div className="text-lg font-semibold mb-3">
            This is your LAST opportunity to save <span className="font-bold text-red-700 text-xl bg-yellow-200 px-2 py-1 rounded">{formatPrice(additionalSavings)}</span> on this order!
          </div>
          {currentTier === 'bronze' && (
            <div className="text-base mb-4">
              Upgrade now for <span className="font-bold text-red-700 text-xl bg-yellow-200 px-2 py-1 rounded">{formatPrice(potentialSavings)}</span> total savings - that's 15% off everything!
            </div>
          )}
          <div className="text-sm text-red-700 mb-4">
            ⏰ Once you submit payment, this offer expires forever for this order!
          </div>
          <Button 
            onClick={handleUpgrade}
            size="lg" 
            className="bg-red-700 hover:bg-red-800 text-white px-8 py-3 text-lg font-bold shadow-2xl border-4 border-yellow-300 animate-pulse hover:animate-none transform hover:scale-105"
          >
            🔥 SAVE {formatPrice(additionalSavings)} NOW! 🔥
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function PaymentPageContent() {
  const { items, getTotalPrice, clearCart } = useCart();
  const { user, login } = useAuth();
  const [, setLocation] = useLocation();
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const { toast } = useToast();
  const [pendingPaymentData, setPendingPaymentData] = useState<PaymentFormData | null>(null);

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      cardNumber: '',
      expirationMonth: '',
      expirationYear: '',
      cardCode: '',
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const expirationDate = `${data.expirationMonth}${data.expirationYear}`;
      
      const response = await apiRequest('POST', '/api/process-payment', {
        cardNumber: data.cardNumber.replace(/\s/g, ''),
        expirationDate,
        cardCode: data.cardCode,
        amount: getTotalPrice(),
        billingInfo: {
          email: user?.email,
          firstName: user?.firstName,
          lastName: user?.lastName,
          address: '123 Test St', // This would come from saved billing info
          city: 'Test City',
          state: 'AZ',
          zip: '12345'
        },
        orderItems: items.map(item => ({
          // Product identifiers for backend lookup
          productId: item.productId,
          upc: item.upc || item.UPC,
          mpn: item.mpn || item.MPN,
          sku: item.productSku || item.rsrStock,
          rsrStock: item.rsrStock,
          
          // Product details
          name: item.productName || item.description,
          description: item.description,
          quantity: item.quantity,
          price: parseFloat(item.price),
          
          // Additional data for order processing
          imageUrl: item.productImage,
          manufacturer: item.manufacturer,
          fulfillmentType: item.fulfillmentType || 'direct',
          selectedFFL: item.selectedFFL || null,
          requiresFFL: item.requiresFFL || false
        }))
      });
      
      return await response.json();
    },
    onSuccess: async (response) => {
      console.log('Payment response:', response);
      if (response?.success) {
        setPaymentSuccess(true);
        clearCart();
        
        // Check if data was enriched on backend (new flow)
        if (response.dataEnriched) {
          console.log('✅ Products already clean - backend handled enrichment');
          console.log('🎯 Direct redirect to order confirmation');
          // Direct redirect since backend already processed everything
          setTimeout(() => {
            if (response.orderId) {
              setLocation(`/order-confirmation?orderId=${response.orderId}`);
            } else {
              setLocation('/order-confirmation');
            }
          }, 2000);
        } else {
          // Legacy fallback: use finalizeOrder for older payment flows
          try {
            console.log('⚠️ Falling back to frontend finalization');
            await finalizeOrder({
              orderId: response.orderId,
              txnId: response.transactionId,
              customer: {
                email: user?.email || 'unknown@example.com',
                name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.firstName || 'Customer'
              },
              lines: items.map(item => ({
                upc: item.upc || '',
                mpn: item.mpn || '',
                sku: item.rsrStock || '',
                name: item.description || '',
                qty: item.quantity || 1,
                price: parseFloat(item.price || '0')
              })),
              // Check if any items require FFL shipping
              shippingOutcomes: items.some(item => item.needsFfl) ? ['DS>FFL'] : ['IH>Customer']
            });
          } catch (error) {
            console.error('Failed to finalize order:', error);
            // Fall back to manual redirect if finalizeOrder fails
            setTimeout(() => {
              if (response.orderId) {
                setLocation(`/order-confirmation?orderId=${response.orderId}`);
              } else {
                setLocation('/order-confirmation');
              }
            }, 2000);
          }
        }
      }
    },
    onError: (error: any) => {
      console.error('Payment error:', error);
      
      // Check if it's an authentication error (401)
      const errorMessage = error?.message || '';
      if (errorMessage.includes('401') || errorMessage.includes('Authentication required')) {
        // Store the payment data to retry after login
        setPendingPaymentData(form.getValues());
        setShowLoginDialog(true);
        toast({
          title: "Session Expired",
          description: "Please log in to continue with your payment.",
          variant: "default",
        });
      } else {
        // Show other errors
        toast({
          title: "Payment Failed",
          description: errorMessage || "An error occurred while processing your payment.",
          variant: "destructive",
        });
      }
    }
  });

  const onSubmit = (data: PaymentFormData) => {
    paymentMutation.mutate(data);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      await login(loginEmail, loginPassword);
      setShowLoginDialog(false);
      setLoginEmail("");
      setLoginPassword("");
      
      toast({
        title: "Login Successful",
        description: "Processing your payment now...",
        variant: "default",
      });
      
      // Retry the payment with the stored data
      if (pendingPaymentData) {
        setTimeout(() => {
          paymentMutation.mutate(pendingPaymentData);
          setPendingPaymentData(null);
        }, 500);
      }
    } catch (error: any) {
      let errorMessage = error.message || "Login failed. Please try again.";
      if (errorMessage.includes('401') || errorMessage.includes('Invalid credentials')) {
        errorMessage = "Invalid email or password. Please try again.";
      }
      setLoginError(errorMessage);
    } finally {
      setLoginLoading(false);
    }
  };

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto text-center">
          <CardContent className="pt-8">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
            <p className="text-gray-600 mb-4">Thank you for your purchase. Redirecting to order confirmation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* Login Dialog */}
      <Dialog open={showLoginDialog} onOpenChange={(open) => {
        if (!open && !loginLoading) {
          setShowLoginDialog(false);
          setLoginEmail("");
          setLoginPassword("");
          setLoginError("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Login Required</DialogTitle>
            <DialogDescription>
              Your session has expired. Please log in to continue with your payment.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="Enter your email"
                required
                disabled={loginLoading}
              />
            </div>
            <div>
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  disabled={loginLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {loginError && (
              <Alert variant="destructive">
                <AlertDescription>{loginError}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loginLoading}>
              {loginLoading ? "Logging in..." : "Login & Continue Payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Final Upgrade Alert - Full Width */}
          <div className="lg:col-span-3 mb-6">
            <FinalUpgradeBenefits user={user} />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Header */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation('/billing')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Billing
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Payment</h1>
                <p className="text-sm text-gray-600">Complete your purchase</p>
              </div>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center justify-center space-x-4 py-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  ✓
                </div>
                <span className="text-sm font-medium text-green-600">FFL Selection</span>
              </div>
              <div className="w-12 h-px bg-gray-300"></div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  ✓
                </div>
                <span className="text-sm font-medium text-green-600">Shipping</span>
              </div>
              <div className="w-12 h-px bg-gray-300"></div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  ✓
                </div>
                <span className="text-sm font-medium text-green-600">Billing</span>
              </div>
              <div className="w-12 h-px bg-gray-300"></div>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">
                  4
                </div>
                <span className="text-sm font-medium text-blue-600">Payment</span>
              </div>
            </div>

            {/* Security Notice */}
            <Alert className="border-green-200 bg-green-50">
              <Shield className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Your payment is secured with industry-standard encryption. We never store your credit card information.
              </AlertDescription>
            </Alert>

            {/* Payment Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Credit Card Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="cardNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Card Number</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="1234 5678 9012 3456"
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="expirationMonth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Month</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="MM" maxLength={2} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="expirationYear"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Year</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="YY" maxLength={2} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="cardCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CVV</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="123" maxLength={4} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {paymentMutation.error && (
                      <Alert className="border-red-200 bg-red-50">
                        <AlertDescription className="text-red-800">
                          Payment failed: {paymentMutation.error.message}
                        </AlertDescription>
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      className="w-full bg-green-600 hover:bg-green-700"
                      disabled={paymentMutation.isPending}
                    >
                      {paymentMutation.isPending ? (
                        "Processing Payment..."
                      ) : (
                        `Complete Purchase - ${formatPrice(getTotalPrice())}`
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle className="text-lg">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between items-start space-x-3 pb-3 border-b border-gray-200 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.description}
                      </p>
                      <p className="text-sm text-gray-600">
                        Qty: {item.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-gray-900 flex-shrink-0">
                      {formatPrice(parseFloat(item.price) * item.quantity)}
                    </p>
                  </div>
                ))}
                
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Total</span>
                    <span className="text-lg font-bold text-gray-900">
                      {formatPrice(getTotalPrice())}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function PaymentPage() {
  return (
    <SubscriptionEnforcement>
      <PaymentPageContent />
    </SubscriptionEnforcement>
  );
}

export default PaymentPage;