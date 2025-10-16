import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TierCardProps {
  tier: "Bronze" | "Gold" | "Platinum";
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  isPopular?: boolean;
  isFounder?: boolean;
  onSelect?: () => void;
  isProcessing?: boolean;
}

function TierCard({ tier, monthlyPrice, annualPrice, features, isPopular, isFounder, onSelect, isProcessing }: TierCardProps) {
  const { user } = useAuth();
  const isCurrentTier = user?.subscriptionTier === tier;

  const getCardClasses = () => {
    switch (tier) {
      case "Bronze":
        return "border-2 border-gray-200";
      case "Gold":
        return "border-2 border-gun-gold shadow-lg";
      case "Platinum":
        return "border-2 border-platinum-dark shadow-lg platinum-glint";
      default:
        return "";
    }
  };

  const getHeaderClasses = () => {
    switch (tier) {
      case "Bronze":
        return "bg-gray-600 text-white";
      case "Gold":
        return "bg-gun-gold text-gun-black";
      case "Platinum":
        return "bg-platinum-dark text-white";
      default:
        return "";
    }
  };

  const getButtonClasses = () => {
    switch (tier) {
      case "Bronze":
        return "bg-gray-600 hover:bg-gray-700 text-white";
      case "Gold":
        return "bg-gun-gold hover:bg-gun-gold-bright text-gun-black";
      case "Platinum":
        return "bg-platinum-dark hover:bg-gray-600 text-white";
      default:
        return "";
    }
  };

  return (
    <Card 
      className={cn("relative overflow-hidden cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl", getCardClasses())}
      onClick={onSelect}
    >
      <CardHeader className={cn("py-4 px-6", getHeaderClasses())}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-oswald font-bold">{tier}</CardTitle>
          {isPopular && (
            <Badge variant="secondary" className="bg-white text-gray-900">
              Popular
            </Badge>
          )}
        </div>
        {tier === "Bronze" && (
          <CardDescription className="text-gray-200">FREE MEMBERSHIP</CardDescription>
        )}
        {tier === "Gold" && (
          <CardDescription className="text-gun-black">${monthlyPrice}/month or ${annualPrice}/year</CardDescription>
        )}
        {tier === "Platinum" && (
          <CardDescription className="text-white">
            {isFounder ? `FOUNDER PRICING: $${monthlyPrice}/month or $${annualPrice}/year` : `$${monthlyPrice}/month`}
          </CardDescription>
        )}

      </CardHeader>
      
      <CardContent className="p-6">
        <div className="text-center mb-6">
          {tier === "Bronze" ? (
            <div className="text-4xl font-oswald font-bold text-gun-black">
              FREE
            </div>
          ) : (
            <>
              <div className="text-4xl font-oswald font-bold text-gun-black">
                ${monthlyPrice}
              </div>
              <div className="text-gun-gray-light">/month</div>
              {annualPrice > 0 && (
                <div className="text-sm text-gun-gray-light mt-1">
                  or ${annualPrice}/year {tier === "Platinum" && isFounder && "(Founder Rate)"}
                </div>
              )}
            </>
          )}
        </div>
        
        <ul className="space-y-2 mb-6">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start">
              <span className="text-gun-gold mr-2">•</span>
              <span className="text-sm text-gray-700">{feature}</span>
            </li>
          ))}
        </ul>
        
        <div className="text-center">
          {isCurrentTier ? (
            <div className="w-full py-2 px-4 bg-gray-100 text-gray-500 rounded-md font-medium">
              Current Plan
            </div>
          ) : (
            <div className={cn("w-full py-2 px-4 rounded-md font-medium text-center", getButtonClasses())}>
              {isProcessing ? (
                "Processing..."
              ) : tier === "Bronze" ? (
                "Get Started"
              ) : (
                `Select ${tier}`
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function TierCards() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const handleTierSelect = async (tier: string) => {
    if (!user) {
      // Store selected tier in localStorage for after registration/verification
      localStorage.setItem('selectedTier', tier);
      // Redirect to registration (no tier parameter in URL)
      window.location.href = '/register';
      return;
    }

    // Bronze is free - can upgrade immediately
    if (tier === "Bronze") {
      setIsProcessing(tier);
      try {
        const response = await apiRequest(
          "POST",
          "/api/membership/upgrade",
          {
            targetTier: tier,
            billingCycle: "monthly"
          }
        );

        if (response.success) {
          toast({
            title: "Success!",
            description: response.message,
            variant: "default",
          });
          // Refresh page to show updated tier
          window.location.reload();
        } else {
          toast({
            title: "Upgrade failed",
            description: response.message || "Failed to upgrade to Bronze tier",
            variant: "destructive",
          });
        }
      } catch (error: any) {
        console.error("Bronze upgrade error:", error);
        toast({
          title: "Upgrade failed",
          description: error.message || "Failed to upgrade membership",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(null);
      }
      return;
    }

    // For paid tiers, redirect to hosted payment portal
    setIsProcessing(tier);
    try {
      const response = await apiRequest(
        "POST",
        "/api/membership/upgrade",
        {
          targetTier: tier,
          billingCycle: "monthly", // TODO: Let user choose monthly vs yearly
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
      setIsProcessing(null);
    }
  };

  const tiers: Array<{
    tier: "Bronze" | "Gold" | "Platinum";
    monthlyPrice: number;
    annualPrice: number;
    features: string[];
    isPopular?: boolean;
    isFounder?: boolean;
  }> = [
    {
      tier: "Bronze" as const,
      monthlyPrice: 0,
      annualPrice: 0,
      features: [
        "View pricing on all products",
        "Basic customer support",
        "Access to product catalog",
        "Standard shipping rates"
      ],
      isPopular: false
    },
    {
      tier: "Gold" as const,
      monthlyPrice: 5,
      annualPrice: 50,
      features: [
        "Everything in Bronze",
        "Better pricing on most items",
        "Priority customer support",
        "Early access to deals",
        "Monthly member specials"
      ],
      isPopular: false
    },
    {
      tier: "Platinum" as const,
      monthlyPrice: 10,
      annualPrice: 50,
      features: [
        "Everything in Gold",
        "Best pricing - near wholesale",
        "VIP customer support",
        "Free shipping on all orders",
        "Exclusive product access",
        "Special member events"
      ],
      isPopular: true,
      isFounder: true
    }
  ];

  return (
    <div className="grid md:grid-cols-3 gap-8">
      {tiers.map((tier) => (
        <TierCard
          key={tier.tier}
          tier={tier.tier}
          monthlyPrice={tier.monthlyPrice}
          annualPrice={tier.annualPrice}
          features={tier.features}
          isPopular={tier.isPopular}
          isFounder={tier.isFounder}
          onSelect={() => handleTierSelect(tier.tier)}
          isProcessing={isProcessing === tier.tier}
        />
      ))}
    </div>
  );
}
