import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowLeft, Star, Zap, CreditCard } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function TierPayment() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  // Get tier from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const selectedTier = urlParams.get('tier')?.toLowerCase() || '';

  // Fetch user status to verify they should be here
  const { data: userStatus } = useQuery({
    queryKey: ['/api/me'],
    enabled: !!user,
  });

  // Tier configurations
  const tierConfig = {
    gold: {
      name: "Gold",
      monthlyPrice: 5,
      annualPrice: 50,
      icon: <Star className="h-6 w-6" />,
      color: "border-gun-gold bg-gun-gold/10",
      buttonColor: "bg-gun-gold hover:bg-gun-gold-bright text-gun-black",
      features: [
        "15% discount on all orders",
        "Priority customer support", 
        "Free shipping on orders $200+",
        "Access to exclusive deals",
        "Early access to sales"
      ]
    },
    platinum: {
      name: "Platinum", 
      monthlyPrice: 10,
      annualPrice: 50,
      icon: <Zap className="h-6 w-6" />,
      color: "border-platinum-dark bg-platinum/10",
      buttonColor: "bg-platinum-dark hover:bg-gray-600 text-white",
      features: [
        "25% discount on all orders",
        "VIP customer support",
        "Free shipping on all orders", 
        "Exclusive early access to new products",
        "Priority order processing",
        "Special member events"
      ]
    }
  };

  const currentTier = tierConfig[selectedTier as keyof typeof tierConfig];

  // Redirect if invalid tier
  if (!selectedTier || !currentTier) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto text-center">
          <CardContent className="pt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Invalid Tier Selection</h2>
            <p className="text-gray-600 mb-4">Please select a valid membership tier.</p>
            <Button onClick={() => setLocation('/membership')}>
              Choose Membership Tier
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if user should be here (verified_pending_payment status)
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md mx-auto text-center">
          <CardContent className="pt-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Login Required</h2>
            <p className="text-gray-600 mb-4">Please log in to upgrade your membership.</p>
            <Button onClick={() => setLocation('/login')}>
              Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle tier upgrade payment
  const handleUpgrade = async () => {
    setIsProcessing(true);
    try {
      const response = await apiRequest(
        "POST",
        "/api/membership/upgrade",
        {
          targetTier: currentTier.name,
          billingCycle: "monthly",
          billingInfo: {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
          }
        }
      );

      if (response.success && response.paymentRequired) {
        // Create a form and submit to hosted payment portal
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = response.hostedFormUrl;

        // Add all form data as hidden inputs
        Object.entries(response.formData).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value as string;
          form.appendChild(input);
        });

        document.body.appendChild(form);
        form.submit();
      } else {
        toast({
          title: "Payment setup failed",
          description: response.message || "Could not initialize payment process",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Tier upgrade error:", error);
      toast({
        title: "Upgrade failed",
        description: error.message || "Failed to start upgrade process",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/membership')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Membership
          </Button>
          <div>
            <h1 className="text-3xl font-oswald font-bold text-gun-black">
              Complete Your {currentTier.name} Upgrade
            </h1>
            <p className="text-gun-gray-light">
              Finish your membership upgrade to unlock exclusive benefits
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Tier Details */}
          <div>
            <Card className={`${currentTier.color} border-2`}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-white">
                    {currentTier.icon}
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-oswald">
                      {currentTier.name} Membership
                    </CardTitle>
                    <Badge variant="outline" className="mt-1">
                      Selected Tier
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-6">
                  <div className="text-4xl font-oswald font-bold text-gun-black">
                    ${currentTier.monthlyPrice}
                  </div>
                  <div className="text-gun-gray-light">/month</div>
                  <div className="text-sm text-gun-gray-light mt-1">
                    or ${currentTier.annualPrice}/year
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h4 className="font-semibold text-gun-black">Your Benefits:</h4>
                  {currentTier.features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <CheckCircle className="h-5 w-5 text-gun-gold mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Section */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Payment Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-sm font-bold">!</span>
                    </div>
                    <div>
                      <h4 className="font-semibold text-blue-900 mb-1">
                        Secure Payment Processing
                      </h4>
                      <p className="text-blue-800 text-sm">
                        You'll be redirected to our secure payment portal powered by Authorize.Net 
                        to complete your membership upgrade safely.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Membership Tier:</span>
                    <span className="font-semibold">{currentTier.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Billing:</span>
                    <span className="font-semibold">Monthly</span>
                  </div>
                  <div className="flex justify-between border-t pt-3">
                    <span className="text-lg font-semibold">Total:</span>
                    <span className="text-lg font-bold text-gun-black">
                      ${currentTier.monthlyPrice}/month
                    </span>
                  </div>
                </div>

                <Button 
                  onClick={handleUpgrade}
                  disabled={isProcessing}
                  className={`w-full font-medium text-lg py-3 ${currentTier.buttonColor}`}
                  data-testid={`button-complete-upgrade-${selectedTier}`}
                >
                  {isProcessing ? (
                    "Processing..."
                  ) : (
                    `Complete ${currentTier.name} Upgrade - $${currentTier.monthlyPrice}/month`
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  By clicking "Complete Upgrade", you agree to our terms of service 
                  and authorize us to charge your payment method monthly.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}