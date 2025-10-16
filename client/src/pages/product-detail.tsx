import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/use-cart";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { getComprehensivePricing, getCartTierPrice, getAllTierPrices, formatPrice } from "@/lib/pricing-utils";
import { 
  ArrowLeft, 
  Heart, 
  Share2, 
  ShoppingCart, 
  Star, 
  Shield,
  Truck,
  AlertCircle,
  Check,
  Info,
  Plus,
  Minus,
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  Package,
  DollarSign,
  TrendingUp,
  Award,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ImageIcon
} from "lucide-react";

interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  subcategoryName: string;
  departmentNumber: string;
  departmentDesc: string;
  subDepartmentDesc: string;
  manufacturer: string;
  manufacturerPartNumber: string;
  sku: string;
  rsrStockNumber?: string;
  priceWholesale: string;
  priceMAP: string;
  priceMSRP: string;
  priceBronze: string;
  priceGold: string;
  pricePlatinum: string;
  inStock: boolean;
  stockQuantity: number;
  allocated: string;
  newItem: boolean;
  promo: string;
  accessories: string;
  distributor: string;
  requiresFFL: boolean;
  mustRouteThroughGunFirm: boolean;
  tags: string[];
  images: any[];
  upcCode: string;
  weight: number;
  dimensions: any;
  restrictions: any;
  stateRestrictions: string[];
  groundShipOnly: boolean;
  adultSignatureRequired: boolean;
  dropShippable: boolean;
  prop65: boolean;
  returnPolicyDays: number;
  isActive: boolean;
  createdAt: string;
}

interface RelatedProduct {
  id: number;
  name: string;
  manufacturer: string;
  sku: string;
  priceBronze: string;
  priceGold: string;
  pricePlatinum: string;
  inStock: boolean;
  requiresFFL: boolean;
  category: string;
}

export default function ProductDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { addItem, setCartOpen } = useCart();
  
  // State management
  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isWishlist, setIsWishlist] = useState(false);
  const [selectedFFL, setSelectedFFL] = useState<string>("");
  const [userZip, setUserZip] = useState("");

  // Fetch product data with minimal caching to ensure fresh pricing
  const { data: product, isLoading, error } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/products/${id}`);
      return response.json() as Promise<Product>;
    },
    enabled: !!id,
    staleTime: 30 * 1000, // 30 seconds - fresh pricing data
    gcTime: 60 * 1000, // 1 minute
    retry: 2,
  });

  // Fetch dynamic fallback image from CMS
  const { data: fallbackImageSetting } = useQuery({
    queryKey: ["/api/admin/fallback-image"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/fallback-image");
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const fallbackImage = fallbackImageSetting?.value || "/fallback-logo.png";

  // Fetch related products with minimal caching
  const { data: relatedProducts, isLoading: relatedLoading, error: relatedError } = useQuery({
    queryKey: ['related-products', product?.id],
    queryFn: async () => {
      if (!product) return [];
      console.log('Fetching related products for product:', product.id, product.name);
      const response = await apiRequest('GET', `/api/products/related/${product.id}`);
      const data = await response.json() as RelatedProduct[];
      console.log('Related products received:', data.length, 'products');
      return data;
    },
    enabled: !!product,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 30 * 1000, // 30 seconds
  });

  // Fetch FFLs if required
  const { data: nearbyFFLs } = useQuery({
    queryKey: ['nearby-ffls', userZip],
    queryFn: async () => {
      if (!userZip || userZip.length !== 5) return [];
      const response = await apiRequest('GET', `/api/ffls/search/${userZip}`);
      return response.json();
    },
    enabled: !!(product?.requiresFFL && userZip && userZip.length === 5),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  // Auto-populate user ZIP if logged in
  useEffect(() => {
    if (user && user.shippingAddress && user.shippingAddress.zip) {
      setUserZip(user.shippingAddress.zip);
    }
  }, [user]);


  // Get comprehensive pricing using centralized utility
  const pricingInfo = product ? getComprehensivePricing(product, user as any, 'public') : null;
  const allTierPrices = product ? getAllTierPrices(product) : null;

  // Image handling with multiple angles - Use RSR stock number for images
  const getImageUrl = (angle: number = 1) => {
    const imageKey = product?.rsrStockNumber || product?.sku;
    if (!imageKey) return fallbackImage;
    return `/api/image/${imageKey}?angle=${angle}`;
  };

  const getThumbnailUrl = (angle: number = 1) => {
    const imageKey = product?.rsrStockNumber || product?.sku;
    if (!imageKey) return fallbackImage;
    return `/api/image/${imageKey}?angle=${angle}&size=thumbnail`;
  };

  // Image loading state management
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>('');
  
  // Available angles for images (RSR supports up to 3 angles)
  const availableAngles = [1, 2, 3];
  const [currentAngle, setCurrentAngle] = useState(1);
  const [availableImages, setAvailableImages] = useState<number[]>([]);
  const [showHighRes, setShowHighRes] = useState(false);

  // Check available images on product load
  useEffect(() => {
    const imageKey = product?.rsrStockNumber || product?.sku;
    if (imageKey) {
      setImageLoading(true);
      setImageError(false);
      
      // Skip pre-validation - just try to load the images directly
      // The backend is working fine, let the image onLoad/onError handle it
      setAvailableImages([1, 2, 3]); // Allow all angles
      setCurrentAngle(1);
      setImageSrc(getImageUrl(1));
      setImageLoading(false);
      setImageError(false);
    }
  }, [product?.rsrStockNumber, product?.sku]);

  // Update image source when angle changes
  useEffect(() => {
    if (availableImages.includes(currentAngle)) {
      setImageSrc(getImageUrl(currentAngle));
    }
  }, [currentAngle, availableImages]);

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImageLoading(false);
    setImageError(false);
    // Use fallback logo for missing RSR images
    e.currentTarget.src = fallbackImage;
    e.currentTarget.onerror = null; // Prevent infinite loop
  };

  // Handlers
  const handleQuantityChange = (delta: number) => {
    setQuantity(Math.max(1, Math.min(10, quantity + delta)));
  };

  const handleAddToCart = async () => {
    if (!product) return;

    // Check for shipping state (if user is logged in)
    const shippingState = user?.shippingAddress?.state || localStorage.getItem('selectedShippingState');
    
    // If a shipping state is selected, check compliance first
    if (shippingState) {
      try {
        const response = await fetch('/api/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: product.sku,
            quantity: quantity,
            shipState: shippingState
          })
        });

        if (!response.ok) {
          const error = await response.json();
          
          // Handle state compliance errors specifically
          if (response.status === 422 && error.code?.startsWith('STATE_BLOCKED_')) {
            toast({
              title: "State Restriction",
              description: error.message || `Cannot ship this product to ${shippingState}`,
              variant: "destructive",
              duration: 5000
            });
            return;
          }
          
          // Handle other errors
          toast({
            title: "Error",
            description: error.message || "Failed to add item to cart",
            variant: "destructive"
          });
          return;
        }
      } catch (err) {
        console.error('Error checking compliance:', err);
        // Continue with local cart add if compliance check fails
      }
    }

    // Add item to cart with pricing based on user tier or Bronze if not logged in
    const currentPrice = pricingInfo?.price || 0;
    
    addItem({
      productId: product.id,
      productMPN: product.sku, // Fixed: Use correct field name expected by cart
      productName: product.name,
      productImage: (product.rsrStockNumber || product.sku) ? `/api/image/${product.rsrStockNumber || product.sku}` : "/fallback-logo.png",
      quantity: quantity,
      price: currentPrice, // Use tier-appropriate pricing
      priceBronze: parseFloat(product.priceBronze || "0"),
      priceGold: parseFloat(product.priceGold || "0"),
      pricePlatinum: parseFloat(product.pricePlatinum || "0"),
      requiresFFL: product.requiresFFL,
      selectedFFL: selectedFFL,
      manufacturer: product.manufacturer,
      dropShippable: product.dropShippable // Add missing field for fulfillment logic
    });

    // Open cart to show the item was added (removed toast notification to avoid blocking CTA)
    setCartOpen(true);
  };

  const handleWishlist = () => {
    if (!user) {
      toast({
        title: "Sign In Required",
        description: "Please sign in to save items to your wishlist.",
        variant: "destructive",
      });
      return;
    }

    setIsWishlist(!isWishlist);
    toast({
      title: isWishlist ? "Removed from Wishlist" : "Added to Wishlist",
      description: `${product?.name} ${isWishlist ? "removed from" : "added to"} your wishlist.`,
    });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product?.name,
          text: `Check out this ${product?.category} from ${product?.manufacturer}`,
          url: window.location.href,
        });
      } catch (error) {
        // Fallback to clipboard
        navigator.clipboard.writeText(window.location.href);
        toast({
          title: "Link Copied",
          description: "Product link copied to clipboard.",
        });
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link Copied",
        description: "Product link copied to clipboard.",
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-6"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="h-96 bg-gray-200 rounded"></div>
              <div className="space-y-4">
                <div className="h-8 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                <div className="h-12 bg-gray-200 rounded w-1/2"></div>
                <div className="h-16 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h1>
          <p className="text-gray-600 mb-6">The product you're looking for doesn't exist or has been removed.</p>
          <Link href="/products">
            <Button>Browse Products</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-6 animate-in fade-in slide-in-from-top duration-500">
          <Link href="/products" className="hover:text-gray-900">
            <Button variant="ghost" size="sm" className="p-0 h-auto transition-all duration-200 hover:scale-105">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Products
            </Button>
          </Link>
          <span>/</span>
          <span className="text-gray-400">{product.category}</span>
          <span>/</span>
          <span className="text-gray-900 font-medium">{product.name}</span>
        </div>

        {/* Main Product Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8 mb-12">
          {/* Product Images */}
          <div className="space-y-4 animate-in fade-in slide-in-from-left duration-700">
            {/* Main Image */}
            <div className="aspect-square max-h-[60vh] sm:max-h-none bg-white rounded-lg border border-gray-200 p-2 sm:p-4 relative">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
              )}
              {!imageLoading && (
                <img
                  src={imageSrc}
                  alt={`${product.name} - View ${currentAngle}`}
                  className="w-full h-full object-contain cursor-pointer transition-all duration-300 hover:scale-105"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  style={{ display: imageLoading ? 'none' : 'block' }}
                  onClick={() => setShowHighRes(true)}
                />
              )}
            </div>
            
            {/* Thumbnail Gallery - Only show if multiple images available */}
            {availableImages.length > 1 && (
              <div className="flex gap-2 justify-center">
                {availableImages.map((angle) => (
                  <button
                    key={angle}
                    onClick={() => setCurrentAngle(angle)}
                    className={cn(
                      "w-16 h-16 rounded-lg border-2 overflow-hidden",
                      currentAngle === angle
                        ? "border-blue-500 ring-2 ring-blue-200"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <img
                      src={getImageUrl(angle)}
                      alt={`${product.name} - View ${angle}`}
                      className="w-full h-full object-contain bg-white"
                    />
                  </button>
                ))}
              </div>
            )}
            
            {/* High Resolution View Modal */}
            {showHighRes && availableImages.length > 0 && (
              <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                <div className="max-w-4xl max-h-[90vh] p-4">
                  <div className="bg-white rounded-lg overflow-hidden">
                    <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="text-lg font-semibold">High Resolution View</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHighRes(false)}
                      >
                        ×
                      </Button>
                    </div>
                    <div className="p-4">
                      <img
                        src={`/api/image/${product.rsrStockNumber || product.sku}?angle=${currentAngle}&size=highres`}
                        alt={`${product.name} - High Resolution View ${currentAngle}`}
                        className="max-w-full max-h-[70vh] object-contain mx-auto"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* View High Resolution Link */}
            {availableImages.length > 0 && (
              <div className="text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHighRes(true)}
                  className="text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View High Resolution
                </Button>
              </div>
            )}

          </div>

          {/* Product Info */}
          <div className="space-y-6 animate-in fade-in slide-in-from-right duration-700 delay-200">
            {/* Product Header */}
            <div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{product.manufacturer}</Badge>
                  {product.newItem && <Badge variant="secondary">New</Badge>}
                  {product.promo && <Badge variant="destructive">Closeout</Badge>}
                  {product.requiresFFL && <Badge variant="default">FFL Required</Badge>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-all duration-200 hover:scale-105"
                >
                  <Share2 className="w-3 h-3" />
                  Share
                </Button>
              </div>
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2 leading-tight">{product.name}</h1>
              <h2 className="text-base sm:text-lg text-gray-600 mb-2">{product.manufacturer}</h2>
              <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{product.description}</p>
            </div>

            {/* SKU and Details */}
            <div className="flex flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
              <div>SKU: <span className="font-medium">{product.sku}</span></div>
              {product.manufacturerPartNumber && (
                <div>MPN: <span className="font-medium">{product.manufacturerPartNumber}</span></div>
              )}
              {product.upcCode && (
                <div>UPC: <span className="font-medium">{product.upcCode}</span></div>
              )}
            </div>

            {/* Stock and Shipping Status with Add to Cart */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  {product.inStock ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-green-600 font-medium">In Stock</span>
                      {product.stockQuantity > 0 && (
                        <span className="text-gray-500">({product.stockQuantity} available)</span>
                      )}
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-red-500" />
                      <span className="text-red-600 font-medium">Out of Stock</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-gray-600">
                    {product.dropShippable ? "Ships Direct" : "Ships from Warehouse"}
                  </span>
                </div>
              </div>
              
              {/* Add to Cart section */}
              <div className="flex flex-col sm:items-end gap-2">
                <div className="flex items-center gap-2 justify-center sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuantityChange(-1)}
                    disabled={quantity <= 1}
                    className="w-8 h-8 p-0 transition-all duration-200 hover:scale-110"
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-8 text-center text-sm">{quantity}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuantityChange(1)}
                    disabled={quantity >= 10}
                    className="w-8 h-8 p-0 transition-all duration-200 hover:scale-110"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 justify-center sm:justify-end">
                  <Button
                    onClick={handleAddToCart}
                    disabled={!product.inStock}
                    className="flex items-center gap-2 bg-gun-gold hover:bg-gun-gold-bright text-gun-black font-medium transition-all duration-200 hover:scale-[1.02]"
                    size="sm"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span className="hidden xs:inline">{product.inStock ? "Add to Cart" : "Out of Stock"}</span>
                    <span className="xs:hidden">{product.inStock ? "Add" : "Out"}</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleWishlist}
                    className="flex items-center gap-1 text-xs px-2 transition-all duration-200 hover:scale-[1.02]"
                    size="sm"
                  >
                    <Heart className={cn("w-3 h-3", isWishlist && "fill-current")} />
                    <span className="hidden xs:inline">Wishlist</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <Card className="animate-in fade-in slide-in-from-bottom duration-500 delay-300">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* MSRP - Show if available */}
                  {product.priceMSRP && parseFloat(product.priceMSRP || '0') > 0 && (
                    <div className="flex justify-between items-center pb-2 border-b">
                      <div className="text-sm text-gray-500">MSRP</div>
                      <div className="text-lg text-gray-500 line-through">
                        ${(parseFloat(product.priceMSRP || '0') || 0).toFixed(2)}
                      </div>
                    </div>
                  )}

                  {/* Always show all three tier prices */}
                  <div className="space-y-2">
                    {/* Bronze Pricing */}
                    <div className={`p-3 border rounded-lg flex justify-between items-center ${user?.subscriptionTier === 'Bronze' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-2">
                        <div className={`text-sm ${user?.subscriptionTier === 'Bronze' ? 'text-green-700 font-medium' : 'text-gray-600'}`}>
                          Bronze {user?.subscriptionTier === 'Bronze' && '(Your Tier)'}
                        </div>
                      </div>
                      <div className={`text-xl font-bold ${user?.subscriptionTier === 'Bronze' ? 'text-green-700' : 'text-gray-900'}`}>
                        ${(parseFloat(product.priceBronze || '0') || 0).toFixed(2)}
                      </div>
                    </div>
                    
                    {/* Gold Pricing */}
                    <div className={`p-3 border rounded-lg flex justify-between items-center ${user?.subscriptionTier === 'Gold' ? 'border-green-500 bg-green-50' : 'border-yellow-400 bg-yellow-50'}`}>
                      <div className="flex items-center gap-2">
                        <div className={`text-sm font-medium ${user?.subscriptionTier === 'Gold' ? 'text-green-700' : 'text-yellow-700'}`}>
                          Gold {user?.subscriptionTier === 'Gold' && '(Your Tier)'}
                        </div>
                      </div>
                      <div className={`text-xl font-bold ${user?.subscriptionTier === 'Gold' ? 'text-green-700' : 'text-yellow-700'}`}>
                        ${(parseFloat(product.priceGold || '0') || 0).toFixed(2)}
                      </div>
                    </div>
                    
                    {/* Platinum Pricing */}
                    <div className={`p-3 border-2 rounded-lg ${user?.subscriptionTier === 'Platinum' ? 'border-green-500 bg-green-50' : 'border-gray-400 bg-gradient-to-br from-gray-100 to-gray-50'}`}>
                      <div className="flex justify-between items-center">
                        <div className={`text-sm font-semibold ${user?.subscriptionTier === 'Platinum' ? 'text-green-700' : 'text-gray-700'}`}>
                          Platinum {user?.subscriptionTier === 'Platinum' && '(Your Tier)'}
                        </div>
                        <div className={`text-xl font-bold ${user?.subscriptionTier === 'Platinum' ? 'text-green-700' : 'text-gray-900'}`}>
                          ${(parseFloat(product.pricePlatinum || '0') || 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Show savings for logged in users */}
                  {user && pricingInfo?.savings && pricingInfo.savings > 0 && (
                    <div className="text-center p-2 bg-green-50 rounded-lg">
                      <div className="text-sm font-medium text-green-700">
                        You Save {formatPrice(pricingInfo.savings)} with {user.subscriptionTier} Membership
                      </div>
                    </div>
                  )}

                  {/* CTA Section for non-logged in users */}
                  {!user && (
                    <div className="text-center p-4 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg border-2 border-yellow-600">
                      <p className="text-yellow-300 mb-3">
                        Sign up to unlock member pricing
                      </p>
                      <Link href="/register">
                        <Button 
                          size="lg" 
                          className="w-full bg-gradient-to-r from-gray-700 to-black hover:from-gray-600 hover:to-gray-800 text-yellow-300 font-semibold px-4 sm:px-8 py-3 relative overflow-hidden transition-all duration-200 hover:scale-[1.02] text-sm sm:text-base"
                        >
                          <span className="relative z-10">
                            Sign Up for Free
                          </span>
                          <div className="absolute inset-0 bg-gradient-to-r from-yellow-600/20 to-amber-500/20 animate-pulse"></div>
                        </Button>
                      </Link>
                    </div>
                  )}

                  {/* Tier Upgrade Incentives for logged in Bronze/Gold users */}
                  {user && (user.subscriptionTier === "Bronze" || user.subscriptionTier === "Gold") && (
                    <div className="space-y-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-yellow-600" />
                        <span className="text-sm font-medium text-yellow-800">Upgrade & Save More</span>
                      </div>
                      {user.subscriptionTier === "Bronze" && (
                        <div className="text-sm text-yellow-700">
                          <div>Upgrade to Gold and save {allTierPrices?.gold && allTierPrices.bronze ? formatPrice(allTierPrices.bronze - allTierPrices.gold) : 'N/A'} on this item</div>
                          <div>Upgrade to Platinum and save {allTierPrices?.platinum && allTierPrices.bronze ? formatPrice(allTierPrices.bronze - allTierPrices.platinum) : 'N/A'} on this item</div>
                        </div>
                      )}
                      {user.subscriptionTier === "Gold" && (
                        <div className="text-sm text-yellow-700">
                          <div>Upgrade to Platinum and save {allTierPrices?.platinum && allTierPrices.gold ? formatPrice(allTierPrices.gold - allTierPrices.platinum) : 'N/A'} on this item</div>
                        </div>
                      )}
                      <Link href="/membership">
                        <Button size="sm" variant="outline" className="w-full transition-all duration-200 hover:scale-[1.02]">
                          Upgrade Membership
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>



            {/* Compliance Information */}
            {(product.requiresFFL || product.prop65) && (
              <Card className="animate-in fade-in slide-in-from-bottom duration-500 delay-400">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Compliance Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {product.requiresFFL && (
                    <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                      <Shield className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-red-800 mb-1">FFL Required</h4>
                        <p className="text-sm text-red-700">
                          This firearm must be shipped to a licensed FFL dealer. FFL dealer selection will be handled during checkout.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {product.prop65 && (
                    <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-yellow-800 mb-1">California Prop 65 Warning</h4>
                        <p className="text-sm text-yellow-700">
                          This product may contain chemicals known to the State of California to cause cancer, birth defects, or other reproductive harm.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Key Features */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-gray-500" />
                <span>{product.groundShipOnly ? "Ground Shipping Only" : "Standard Shipping"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-500" />
                <span>{product.dropShippable ? "Drop Ship Available" : "Warehouse Only"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <span>{product.returnPolicyDays} Day Returns</span>
              </div>
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-gray-500" />
                <span>{product.distributor} Authorized</span>
              </div>
            </div>
          </div>
        </div>

        {/* Product Details Tabs */}
        <Tabs defaultValue="details" className="mb-12 animate-in fade-in slide-in-from-bottom duration-500 delay-500">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="specifications">Specifications</TabsTrigger>
            <TabsTrigger value="shipping">Shipping</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {product.description && (
                    <div>
                      <h3 className="font-semibold mb-2">Description</h3>
                      <p className="text-gray-700">{product.description}</p>
                    </div>
                  )}
                  
                  {product.accessories && (
                    <div>
                      <h3 className="font-semibold mb-2">Included Accessories</h3>
                      <p className="text-gray-700">{product.accessories}</p>
                    </div>
                  )}

                  {product.tags && product.tags.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {product.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="specifications" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="font-semibold">Product Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Manufacturer:</span>
                        <span className="font-medium">{product.manufacturer}</span>
                      </div>
                      {product.manufacturerPartNumber && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">MPN:</span>
                          <span className="font-medium">{product.manufacturerPartNumber}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Category:</span>
                        <span className="font-medium">{product.category}</span>
                      </div>
                      {product.subcategoryName && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Type:</span>
                          <span className="font-medium">{product.subcategoryName}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Department:</span>
                        <span className="font-medium">{product.departmentDesc}</span>
                      </div>
                      {product.weight > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Weight:</span>
                          <span className="font-medium">{product.weight} lbs</span>
                        </div>
                      )}
                      {product.upcCode && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">UPC:</span>
                          <span className="font-medium">{product.upcCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold">Compliance & Shipping</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">FFL Required:</span>
                        <span className="font-medium">{product.requiresFFL ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Drop Shippable:</span>
                        <span className="font-medium">{product.dropShippable ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ground Ship Only:</span>
                        <span className="font-medium">{product.groundShipOnly ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Prop 65 Warning:</span>
                        <span className="font-medium">{product.prop65 ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Adult Signature:</span>
                        <span className="font-medium">{product.adultSignatureRequired ? "Required" : "Not Required"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shipping" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-gray-500" />
                    <div>
                      <div className="font-medium">Shipping Options</div>
                      <div className="text-sm text-gray-600">
                        {product.groundShipOnly ? "Ground shipping only" : "Standard and expedited shipping available"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-gray-500" />
                    <div>
                      <div className="font-medium">Fulfillment</div>
                      <div className="text-sm text-gray-600">
                        {product.dropShippable ? "Ships directly from distributor" : "Ships from our warehouse"}
                      </div>
                    </div>
                  </div>

                  {product.stateRestrictions && product.stateRestrictions.length > 0 && (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
                      <div>
                        <div className="font-medium">State Restrictions</div>
                        <div className="text-sm text-gray-600">
                          Cannot ship to: {product.stateRestrictions.join(", ")}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-gray-500" />
                    <div>
                      <div className="font-medium">Returns</div>
                      <div className="text-sm text-gray-600">
                        {product.returnPolicyDays} day return policy
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Star className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="font-semibold mb-2">No Reviews Yet</h3>
                  <p className="text-gray-600">Be the first to review this product!</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Related Products */}
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-6">Related Products</h2>
          {relatedLoading && (
            <div className="text-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="mt-2 text-gray-600">Loading related products...</p>
            </div>
          )}
          {relatedProducts && Array.isArray(relatedProducts) && relatedProducts.length > 0 && (
            <div className="animate-in fade-in slide-in-from-bottom duration-500 delay-700">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.slice(0, 4).map((related, index) => (
                <Link key={related.id} href={`/product/${related.id}`}>
                  <Card className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom cursor-pointer"
                        style={{animationDelay: `${800 + index * 100}ms`}}>
                    <CardContent className="p-4">
                      <div className="aspect-[5/4] bg-gray-100 rounded-lg mb-3">
                        <img
                          src={`/api/image/${related.sku}`}
                          alt={related.name}
                          className="w-full h-full object-contain transition-opacity duration-300"
                          onError={(e) => {
                            // Use fallback logo for missing RSR images
                            e.currentTarget.src = fallbackImage;
                            e.currentTarget.onerror = null; // Prevent infinite loop
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm leading-tight">{related.name}</h3>
                        <div className="text-xs text-gray-600">{related.manufacturer}</div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-black px-1 py-0.5 rounded" style={{background: 'linear-gradient(135deg, rgb(251 191 36) 0%, rgb(245 158 11) 50%, rgb(217 119 6) 100%)'}}>${(parseFloat(related.priceBronze) || 0).toFixed(2)}</span>
                            <span className="text-black px-1 py-0.5 rounded" style={{background: 'linear-gradient(135deg, rgb(254 240 138) 0%, rgb(250 204 21) 50%, rgb(234 179 8) 100%)'}}>${(parseFloat(related.priceGold) || 0).toFixed(2)}</span>
                            <span className="text-black px-1 py-0.5 rounded" style={{background: 'linear-gradient(135deg, rgb(209 213 219) 0%, rgb(156 163 175) 50%, rgb(107 114 128) 100%)'}}>${(parseFloat(related.pricePlatinum) || 0).toFixed(2).replace(/\d/g, '*')}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {related.inStock ? (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            ) : (
                              <XCircle className="w-3 h-3 text-red-500" />
                            )}
                            <span className="text-xs text-gray-500">
                              {related.inStock ? "In Stock" : "Out of Stock"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}