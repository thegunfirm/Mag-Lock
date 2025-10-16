import { TierCards } from "@/components/membership/tier-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Check, Star, Zap, ArrowLeft, AlertCircle, CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export default function Membership() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showPaymentError, setShowPaymentError] = useState(false);
  
  // Check for payment status and redirect parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirectAfter = urlParams.get('redirect');
    const paymentStatus = urlParams.get('payment');
    const upgradedTier = urlParams.get('tier');
    
    // Store redirect destination for after tier selection
    if (redirectAfter) {
      sessionStorage.setItem('tierUpgradeRedirect', redirectAfter);
    }

    // Handle payment status notifications
    if (paymentStatus === 'success' && upgradedTier) {
      setShowPaymentSuccess(true);
      setTimeout(() => setShowPaymentSuccess(false), 10000); // Hide after 10 seconds
    } else if (paymentStatus === 'failed' || paymentStatus === 'error') {
      setShowPaymentError(true);
      setTimeout(() => setShowPaymentError(false), 15000); // Hide after 15 seconds
    }
  }, []);

  // Fetch user's pending payment status
  const { data: userStatus } = useQuery({
    queryKey: ['/api/me'],
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds in case they complete payment
  });

  const hasPendingPayment = userStatus && userStatus.intendedTier && 
    userStatus.intendedTier !== userStatus.subscriptionTier && 
    userStatus.membershipStatus === 'pending_payment';

  const benefits = [
    {
      tier: "Bronze",
      icon: <Check className="h-5 w-5" />,
      title: "Free Access",
      description: "Get started with basic product access and pricing visibility",
      features: [
        "View all product pricing",
        "Access to product catalog",
        "Basic customer support",
        "Standard shipping rates",
        "Account order history"
      ]
    },
    {
      tier: "Gold",
      icon: <Star className="h-5 w-5" />,
      title: "Enhanced Value",
      description: "Unlock significant savings with our most popular tier",
      features: [
        "15% discount on all orders",
        "Priority customer support",
        "Free shipping on orders $200+",
        "Access to exclusive deals",
        "Early access to sales",
        "Extended return window"
      ]
    },
    {
      tier: "Platinum",
      icon: <Zap className="h-5 w-5" />,
      title: "Maximum Benefits",
      description: "Get the ultimate shopping experience with maximum savings",
      features: [
        "25% discount on all orders",
        "VIP customer support",
        "Free shipping on all orders",
        "Exclusive early access to new products",
        "Priority order processing",
        "Dedicated account manager",
        "Special events and training invitations"
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          {/* Back to Checkout Button */}
          {typeof window !== 'undefined' && (sessionStorage.getItem('tierUpgradeRedirect') === '/checkout' || sessionStorage.getItem('tierUpgradeRedirect') === '/order-summary') && (
            <div className="mb-6">
              <Button
                variant="outline"
                onClick={() => setLocation('/order-summary')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Checkout
              </Button>
            </div>
          )}
          
          <h1 className="text-4xl md:text-5xl font-oswald font-bold text-gun-black mb-4">
            MEMBERSHIP TIERS
          </h1>
          <p className="text-xl text-gun-gray-light max-w-3xl mx-auto">
            Choose the membership tier that best fits your needs and unlock exclusive pricing, benefits, and VIP treatment.
          </p>
          
          {/* Upgrade Notice for Checkout Users */}
          {typeof window !== 'undefined' && (sessionStorage.getItem('tierUpgradeRedirect') === '/checkout' || sessionStorage.getItem('tierUpgradeRedirect') === '/order-summary') && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 font-medium">
                Upgrade to Gold or Platinum tier to access checkout and get better pricing on your order.
              </p>
            </div>
          )}
          
          {/* Payment Success Banner */}
          {showPaymentSuccess && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-600" />
                <p className="text-green-800 font-medium">
                  Payment successful! Your membership has been upgraded. Please refresh the page to see your new benefits.
                </p>
              </div>
            </div>
          )}

          {/* Payment Error Banner */}
          {showPaymentError && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-red-800 font-medium">
                  Payment failed or was cancelled. Please try again or contact support if you continue having issues.
                </p>
              </div>
            </div>
          )}

          {/* Pending Payment Banner */}
          {hasPendingPayment && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg" data-testid="pending-payment-banner">
              <div className="flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-amber-800 font-medium mb-2">
                    Complete your {userStatus.intendedTier} membership upgrade
                  </p>
                  <p className="text-amber-700 text-sm mb-3">
                    You selected {userStatus.intendedTier} tier during registration but haven't completed the payment process. 
                    Complete your upgrade to unlock exclusive pricing and benefits.
                  </p>
                  <Button 
                    onClick={() => {
                      // Find the target tier card and trigger its upgrade logic
                      const tierButton = document.querySelector(`[data-testid="button-upgrade-${userStatus.intendedTier.toLowerCase()}"]`) as HTMLButtonElement;
                      if (tierButton) {
                        tierButton.click();
                      }
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    data-testid="button-complete-payment"
                  >
                    Complete Payment - Upgrade to {userStatus.intendedTier}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {user && (
            <div className="mt-6">
              <Badge 
                variant="outline" 
                className={`text-lg px-4 py-2 ${
                  user.subscriptionTier === "Bronze" ? "border-gray-500 text-gray-700" :
                  user.subscriptionTier === "Gold" ? "border-gun-gold text-gun-gold" :
                  "border-platinum-dark text-platinum-dark"
                }`}
              >
                Current Tier: {user.subscriptionTier}
              </Badge>
            </div>
          )}
        </div>

        {/* Tier Cards */}
        <div className="mb-16">
          <TierCards />
        </div>

        {/* Detailed Benefits */}
        <div className="mb-16">
          <h2 className="text-3xl font-oswald font-bold text-gun-black mb-8 text-center">
            TIER BENEFITS
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((benefit) => (
              <Card key={benefit.tier} className="h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      benefit.tier === "Bronze" ? "bg-gray-100 text-gray-600" :
                      benefit.tier === "Gold" ? "bg-gun-gold/10 text-gun-gold" :
                      "bg-platinum/10 text-platinum-dark"
                    }`}>
                      {benefit.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl font-oswald">{benefit.title}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {benefit.tier}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gun-gray-light mb-4">{benefit.description}</p>
                  <ul className="space-y-2">
                    {benefit.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-gun-gold mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-oswald font-bold text-center">
              FREQUENTLY ASKED QUESTIONS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-gun-black mb-2">
                  How do I upgrade my membership tier?
                </h3>
                <p className="text-gun-gray-light">
                  You can upgrade your membership tier at any time through your account settings. 
                  The new pricing will take effect immediately, and you'll be charged the prorated amount.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-gun-black mb-2">
                  Can I cancel my membership anytime?
                </h3>
                <p className="text-gun-gray-light">
                  Yes, you can cancel your paid membership at any time. You'll retain access to your 
                  tier benefits until the end of your current billing period, then automatically 
                  revert to the Bronze (free) tier.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-gun-black mb-2">
                  Do discounts apply to all products?
                </h3>
                <p className="text-gun-gray-light">
                  Yes, your membership tier discount applies to all products in our catalog. 
                  Some special promotions or already discounted items may have restrictions, 
                  which will be clearly noted on the product page.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-gun-black mb-2">
                  What payment methods do you accept?
                </h3>
                <p className="text-gun-gray-light">
                  We accept all major credit cards, PayPal, and ACH bank transfers for membership 
                  payments. All transactions are secured with industry-standard encryption.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
