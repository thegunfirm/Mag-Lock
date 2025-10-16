import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useCart } from '@/hooks/use-cart';
import { ShoppingCart, Minus, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Link } from 'wouter';
import { useFapAuth } from '@/hooks/use-fap-auth';
import { useLocation } from 'wouter';
import { CheckoutButton } from './checkout-button';
import { getCartTierPrice, formatPrice } from '@/lib/pricing-utils';
import type { CartItem } from '@/hooks/use-cart';

export function CartSheet() {
  const { user } = useFapAuth();
  const [, setLocation] = useLocation();
  const { 
    items, 
    isCartOpen, 
    setCartOpen, 
    updateQuantity, 
    removeItem, 
    clearCart,
    getTotalPrice, 
    getItemCount,
    hasFirearms 
  } = useCart();

  // Helper function to convert CartItem to ProductPricing for centralized utility
  const cartItemToProduct = (item: CartItem) => ({
    priceBronze: item.priceBronze?.toString() || '0',
    priceGold: item.priceGold?.toString() || '0', 
    pricePlatinum: item.pricePlatinum?.toString() || '0',
    priceMSRP: item.priceBronze?.toString() || '0', // Use Bronze as fallback for MSRP
  });

  // Calculate tier-aware total using centralized pricing utility
  const tierAwareTotal = items.reduce((sum, item) => {
    const productPricing = cartItemToProduct(item);
    const tierPrice = getCartTierPrice(productPricing, user || null) || 0;
    return sum + tierPrice * item.quantity;
  }, 0);
  
  const total = tierAwareTotal; // Use tier-aware total for consistency
  const itemCount = getItemCount();

  // Calculate potential savings for membership upsell
  const calculateSavings = () => {
    if (!user) {
      // For non-logged users: compare Bronze vs Platinum pricing
      const bronzeCost = items.reduce((sum, item) => {
        const productPricing = cartItemToProduct(item);
        const bronzePrice = getCartTierPrice(productPricing, null) || 0;
        return sum + bronzePrice * item.quantity;
      }, 0);
      
      const platinumCost = items.reduce((sum, item) => {
        const productPricing = cartItemToProduct(item);
        // Create a mock Platinum user to get Platinum pricing
        const platinumUser = { subscriptionTier: 'Platinum' };
        const platinumPrice = getCartTierPrice(productPricing, platinumUser as any) || 0;
        return sum + platinumPrice * item.quantity;
      }, 0);
      
      const savings = bronzeCost - platinumCost;
      return { savings: Math.max(0, savings) };
    } else {
      // For logged users: compare their current tier price vs Platinum pricing
      const currentCost = items.reduce((sum, item) => {
        const productPricing = cartItemToProduct(item);
        const currentPrice = getCartTierPrice(productPricing, user as any) || 0;
        return sum + currentPrice * item.quantity;
      }, 0);
      
      const platinumCost = items.reduce((sum, item) => {
        const productPricing = cartItemToProduct(item);
        // Create a mock Platinum user to get Platinum pricing
        const platinumUser = { subscriptionTier: 'Platinum' };
        const platinumPrice = getCartTierPrice(productPricing, platinumUser as any) || 0;
        return sum + platinumPrice * item.quantity;
      }, 0);
      
      const savings = currentCost - platinumCost;
      return { savings: Math.max(0, savings) };
    }
  };

  const { savings } = calculateSavings();

  return (
    <Sheet open={isCartOpen} onOpenChange={setCartOpen}>
      <SheetContent className="flex flex-col w-full sm:max-w-xs p-0 bg-white border-l shadow-xl fixed right-0 top-0 h-full z-50">
        <SheetHeader className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="h-4 w-4" />
              Cart ({itemCount})
            </SheetTitle>
            <Link href="/cart">
              <Button 
                variant="ghost"
                size="sm"
                className="text-sm h-auto px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 mr-8 font-semibold" 
                onClick={() => setCartOpen(false)}
              >
                Go to Cart
              </Button>
            </Link>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <ShoppingCart className="h-8 w-8 text-gray-400 mb-3" />
              <h3 className="text-sm font-medium mb-1">Your cart is empty</h3>
              <p className="text-xs text-gray-500">
                Add items to get started
              </p>
            </div>
          ) : (
            <div className="py-2">
              {items.map((item, index) => (
                <div key={`${item.productMPN}-${item.productId}`} className="flex gap-2 py-2 border-b border-gray-100 last:border-b-0">
                  <div className="flex-shrink-0">
                    <img
                      src={item.productImage}
                      alt={item.productName}
                      className="w-10 h-10 object-contain rounded"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/api/admin/fallback-image';
                      }}
                    />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-xs truncate leading-tight">
                      {item.productName}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {item.manufacturer}
                    </p>
                    
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                          {formatPrice(getCartTierPrice(cartItemToProduct(item), user as any) || 0)}
                        </span>
                        {/* Show tier pricing indicator */}
                        {user?.subscriptionTier && (
                          <span className="text-xs text-green-600 font-medium">
                            {user.subscriptionTier} Price
                          </span>
                        )}
                        {!user && (
                          <span className="text-xs text-gray-500">
                            Bronze Price
                          </span>
                        )}
                        {/* Show savings if available */}
                        {user && user.subscriptionTier !== 'Bronze' && item.priceBronze && item.priceBronze > item.price && (
                          <span className="text-xs text-red-600 line-through">
                            {formatPrice(item.priceBronze)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (item.quantity <= 1) {
                              removeItem(item.id);
                            } else {
                              updateQuantity(item.id, item.quantity - 1);
                            }
                          }}
                          className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </Button>
                        
                        <span className="text-xs font-medium w-6 text-center">
                          {item.quantity}
                        </span>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateQuantity(item.id, Math.min(10, item.quantity + 1))}
                          className="h-5 w-5 p-0 text-gray-400 hover:text-gray-600"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(item.id)}
                          className="h-5 w-5 p-0 text-gray-400 hover:text-red-500 ml-0.5"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>

                    {item.requiresFFL && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                        <span className="text-xs text-amber-600">FFL Required</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t bg-gray-50 p-4 space-y-3">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''}):</span>
                <span className="text-sm font-bold">{formatPrice(total)}</span>
              </div>
              
              <div className="space-y-2">
                {!user && (
                  <div className="space-y-2">
                    <Button 
                      className="w-full bg-gradient-to-br from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2 relative overflow-hidden"
                      onClick={() => {
                        setCartOpen(false);
                        setLocation('/register?redirect=/order-summary');
                      }}
                    >
                      <span className="relative z-10 text-sm">Save with membership!</span>
                    </Button>
                    <p className="text-xs text-center text-gray-600 px-2">
                      Create a free account or upgrade to Gold/Platinum for exclusive pricing on all items.
                    </p>
                    <div className="text-center">
                      <button 
                        className="text-xs text-blue-600 underline hover:text-blue-700"
                        onClick={() => {
                          setCartOpen(false);
                          setLocation('/login?redirect=/order-summary');
                        }}
                      >
                        Sign in
                      </button>
                    </div>
                  </div>
                )}
                
                {user && !user.membershipPaid && (
                  <div className="space-y-2">
                    <Button 
                      className="w-full bg-gradient-to-br from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2 relative overflow-hidden"
                      onClick={() => {
                        setCartOpen(false);
                        setLocation('/membership?redirect=/order-summary');
                      }}
                    >
                      <span className="relative z-10 text-sm">Upgrade to {user.subscriptionTier === 'Bronze' ? 'Gold/Platinum' : 'Platinum'}</span>
                    </Button>
                    <p className="text-xs text-center text-gray-600 px-2">
                      {savings > 0 ? `Save ${formatPrice(savings)} on this order` : 'Unlock exclusive member pricing'}
                    </p>
                  </div>
                )}
                
                <CheckoutButton 
                  itemCount={itemCount}
                  disabled={items.length === 0}
                  className="mt-4"
                />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}