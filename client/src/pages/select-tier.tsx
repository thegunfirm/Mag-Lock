import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Check, Star, Zap } from "lucide-react";

export default function SelectTier() {
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<string>("monthly");
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    // Get the tier they selected before registration
    const storedTier = localStorage.getItem('selectedTier');
    if (storedTier) {
      setSelectedTier(storedTier);
    } else {
      // If no tier stored, redirect back to membership page
      setLocation('/membership');
    }
  }, [setLocation]);

  const getTierDetails = (tier: string) => {
    switch (tier) {
      case "Bronze":
        return {
          icon: <Check className="h-8 w-8" />,
          price: { monthly: 0, annual: 0 },
          description: "Free membership with basic access",
          features: [
            "View all product pricing",
            "Access to product catalog", 
            "Basic customer support",
            "Standard shipping rates"
          ],
          color: "text-gray-600",
          bgColor: "bg-gray-100"
        };
      case "Gold":
        return {
          icon: <Star className="h-8 w-8" />,
          price: { monthly: 5, annual: 50 },
          description: "Enhanced value with significant savings",
          features: [
            "15% discount on all orders",
            "Priority customer support",
            "Free shipping on orders $200+",
            "Access to exclusive deals",
            "Early access to sales"
          ],
          color: "text-gun-gold",
          bgColor: "bg-gun-gold/10"
        };
      case "Platinum":
        return {
          icon: <Zap className="h-8 w-8" />,
          price: { monthly: 10, annual: 50 },
          description: "Maximum benefits with ultimate savings",
          features: [
            "25% discount on all orders",
            "VIP customer support", 
            "Free shipping on all orders",
            "Exclusive early access to new products",
            "Priority order processing",
            "Special events and training invitations"
          ],
          color: "text-platinum-dark",
          bgColor: "bg-platinum/10"
        };
      default:
        return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please log in to continue.",
        variant: "destructive",
      });
      return;
    }

    if (selectedTier === "Bronze") {
      // Bronze is free - upgrade immediately
      setIsLoading(true);
      try {
        const res = await apiRequest(
          "POST",
          "/api/membership/upgrade",
          {
            targetTier: "Bronze",
            billingCycle: "monthly"
          }
        );
        const response = await res.json();

        if (response.success) {
          localStorage.removeItem('selectedTier'); // Clean up
          toast({
            title: "Success!",
            description: "Your Bronze membership is now active.",
            variant: "default",
          });
          setLocation('/account');
        } else {
          throw new Error(response.message || "Failed to activate Bronze membership");
        }
      } catch (error: any) {
        toast({
          title: "Upgrade failed",
          description: error.message || "Failed to activate membership",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // For paid tiers, redirect to payment portal
    setIsLoading(true);
    try {
      const res = await apiRequest(
        "POST",
        "/api/membership/upgrade",
        {
          targetTier: selectedTier,
          billingCycle: billingCycle,
          billingInfo: {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email
          }
        }
      );
      const response = await res.json();

      if (response.success && response.paymentRequired) {
        localStorage.removeItem('selectedTier'); // Clean up
        
        console.log('Payment form data received:', {
          url: response.hostedFormUrl,
          formFields: Object.keys(response.formData),
          tier: response.targetTier,
          amount: response.amount
        });
        
        // Create form and submit to Authorize.Net hosted payment portal
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = response.hostedFormUrl;
        form.target = '_self'; // Submit in same window

        Object.entries(response.formData).forEach(([key, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = value as string;
          form.appendChild(input);
        });

        document.body.appendChild(form);
        console.log('Submitting payment form to Authorize.Net...');
        form.submit();
      } else {
        throw new Error(response.message || "Failed to initialize payment");
      }
    } catch (error: any) {
      toast({
        title: "Payment setup failed",
        description: error.message || "Could not start payment process",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const tierDetails = getTierDetails(selectedTier);
  
  if (!tierDetails) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const isAnnualBetter = tierDetails.price.annual > 0 && 
    tierDetails.price.annual < (tierDetails.price.monthly * 12);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-oswald font-bold text-gun-black mb-4">
            Complete Your {selectedTier} Membership
          </h1>
          <p className="text-gun-gray-light">
            You're almost done! Choose your billing preference to activate your membership.
          </p>
        </div>

        {/* Selected Tier Card */}
        <Card className="mb-8">
          <CardHeader className={`${tierDetails.bgColor} border-b`}>
            <div className="flex items-center gap-4">
              <div className={tierDetails.color}>
                {tierDetails.icon}
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl font-oswald">{selectedTier}</CardTitle>
                <CardDescription className="text-gun-gray">
                  {tierDetails.description}
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-sm">
                Selected
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gun-black mb-3">Benefits Include:</h3>
                <ul className="space-y-2">
                  {tierDetails.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-gun-gold mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gun-gray">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* Billing Options */}
              {selectedTier !== "Bronze" && (
                <div>
                  <h3 className="font-semibold text-gun-black mb-3">Choose Billing:</h3>
                  <form onSubmit={handleSubmit}>
                    <RadioGroup value={billingCycle} onValueChange={setBillingCycle} className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="monthly" id="monthly" />
                        <Label htmlFor="monthly" className="flex-1">
                          <div className="flex justify-between items-center">
                            <span>Monthly</span>
                            <span className="font-semibold">${tierDetails.price.monthly}/month</span>
                          </div>
                        </Label>
                      </div>
                      
                      {tierDetails.price.annual > 0 && (
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="annual" id="annual" />
                          <Label htmlFor="annual" className="flex-1">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <span>Annual</span>
                                {isAnnualBetter && (
                                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                    Save ${(tierDetails.price.monthly * 12) - tierDetails.price.annual}
                                  </Badge>
                                )}
                              </div>
                              <span className="font-semibold">${tierDetails.price.annual}/year</span>
                            </div>
                          </Label>
                        </div>
                      )}
                    </RadioGroup>
                    
                    <Button
                      type="submit"
                      className="w-full mt-6 bg-gun-gold hover:bg-gun-gold-bright text-gun-black font-medium"
                      disabled={isLoading}
                      data-testid={`button-complete-${selectedTier.toLowerCase()}`}
                    >
                      {isLoading 
                        ? "Processing..." 
                        : selectedTier === "Bronze" 
                          ? "Activate Bronze Membership" 
                          : `Continue to Payment - ${selectedTier} ${billingCycle === 'monthly' ? 'Monthly' : 'Annual'}`
                      }
                    </Button>
                  </form>
                </div>
              )}
              
              {/* Bronze activation */}
              {selectedTier === "Bronze" && (
                <div>
                  <form onSubmit={handleSubmit}>
                    <Button
                      type="submit"
                      className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium"
                      disabled={isLoading}
                      data-testid="button-complete-bronze"
                    >
                      {isLoading ? "Activating..." : "Activate Bronze Membership"}
                    </Button>
                  </form>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Questions?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium text-gun-black">Can I change my billing cycle later?</h4>
                <p className="text-gun-gray-light">Yes, you can switch between monthly and annual billing from your account settings.</p>
              </div>
              <div>
                <h4 className="font-medium text-gun-black">When will I be charged?</h4>
                <p className="text-gun-gray-light">You'll be charged immediately upon completing the payment process.</p>
              </div>
              <div>
                <h4 className="font-medium text-gun-black">Can I cancel anytime?</h4>
                <p className="text-gun-gray-light">Yes, you can cancel your membership at any time from your account settings.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}