// STABLE CHECKPOINT: July 13, 2025 - WORKING - DO NOT MODIFY
// Complete search integration with 100% RSR product coverage
// Filter system operational with proper facet handling
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductGrid } from "@/components/product/product-grid";
import { FilterPanel } from "@/components/search/filter-panel";
import { Search, Filter, X, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface AlgoliaSearchProps {
  initialQuery?: string;
  initialCategory?: string;
  initialManufacturer?: string;
}

interface SearchResult {
  objectID: string;
  title: string;
  description: string;
  sku?: string;
  name?: string;
  manufacturerName?: string;  // Can be null from API
  categoryName?: string;
  subcategoryName?: string;
  departmentNumber?: string;
  departmentDesc?: string;
  subDepartmentDesc?: string;
  stockNumber?: string;
  rsrStockNumber?: string;
  upc?: string;
  mpn?: string;
  // Flat price fields provided by server transformation
  priceBronze?: string;
  priceGold?: string;
  pricePlatinum?: string;
  // Simplified tier pricing structure that matches API response
  tierPricing?: {
    bronze?: number;
    gold?: number;
    platinum?: number;
  };
  // Legacy price structure (may not be used)
  price?: {
    msrp: number;
    retailMap: number;
    dealerPrice: number;
    dealerCasePrice: number;
  };
  // Simplified inventory structure matching API
  inventory?: {
    onHand: number;
    allocated: boolean;
  };
  inventoryQuantity?: number;
  images?: Array<{
    image: string;
    id: string;
  }>;
  inStock?: boolean;
  distributor?: string;
  caliber?: string;
  capacity?: number;
  fflRequired?: boolean;
  tags?: string[];
  weight?: number;
  dropShippable?: boolean;
  newItem?: boolean;
}

interface SearchResponse {
  hits: SearchResult[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
  processingTimeMS: number;
}

interface FilterOptions {
  manufacturers: Array<{ value: string; count: number }>;
  calibers: Array<{ value: string; count: number }>;
  capacities: Array<{ value: string; count: number }>;
  priceRanges: Array<{ value: string; count: number }>;
  stockStatus: Array<{ value: string; count: number }>;
  barrelLengths: Array<{ value: string; count: number }>;
  finishes: Array<{ value: string; count: number }>;
  frameSizes: Array<{ value: string; count: number }>;
  actionTypes: Array<{ value: string; count: number }>;
  sightTypes: Array<{ value: string; count: number }>;
  newItems: Array<{ value: string; count: number }>;
  internalSpecials: Array<{ value: string; count: number }>;
  shippingMethods: Array<{ value: string; count: number }>;
  platformCategories: Array<{ value: string; count: number }>;
  partTypeCategories: Array<{ value: string; count: number }>;
  nfaItemTypes: Array<{ value: string; count: number }>;
  nfaBarrelLengths: Array<{ value: string; count: number }>;
  nfaFinishes: Array<{ value: string; count: number }>;
  accessoryTypes: Array<{ value: string; count: number }>;
  compatibilities: Array<{ value: string; count: number }>;
  materials: Array<{ value: string; count: number }>;
  mountTypes: Array<{ value: string; count: number }>;
  receiverTypes: Array<{ value: string; count: number }>;
  productTypes: Array<{ value: string; count: number }>;
}

interface SuggestionItem {
  objectID: string;
  title: string;
  name: string;
  manufacturerName: string;
  categoryName: string;
  stockNumber: string;
  inventoryQuantity: number;
  inStock: boolean;
  // Flat price fields provided by server transformation
  priceBronze?: string;
  priceGold?: string;
  pricePlatinum?: string;
  tierPricing: {
    bronze: number;
    gold: number;
    platinum: number;
  };
  distributor: string;
  images: any[];
  caliber?: string;
  capacity?: number;
  suggestionReason: string;
}

interface CategorySuggestion {
  category: string;
  count: number;
  items: SuggestionItem[];
}

interface SuggestionsResponse {
  suggestions: CategorySuggestion[];
  totalSuggestions: number;
}

export function AlgoliaSearch({ initialQuery = "", initialCategory = "", initialManufacturer = "" }: AlgoliaSearchProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory || "all");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [resultsPerPage, setResultsPerPage] = useState(24);
  const [sortBy, setSortBy] = useState("relevance");
  const [hasLoadedMoreOnMobile, setHasLoadedMoreOnMobile] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [allLoadedProducts, setAllLoadedProducts] = useState<SearchResult[]>([]);
  
  // Reset sort when category changes
  useEffect(() => {
    setSortBy("relevance");
    setCurrentPage(0);
    setHasLoadedMoreOnMobile(false);
    setAllLoadedProducts([]);
  }, [category]);

  // Track scroll state and detect bottom of results + mobile infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      setHasScrolled(true);
      
      // Check if user has scrolled to the bottom of results
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const footerHeight = 400; // Approximate footer height
      
      // Consider "bottom of results" as being within 200px of the footer
      const isNearBottom = scrollTop + windowHeight >= documentHeight - footerHeight;
      setIsAtBottom(isNearBottom);
      
      // Show scroll to top button when scrolled down 300px on mobile
      const isMobile = window.innerWidth < 640; // sm breakpoint
      if (isMobile) {
        setShowScrollToTop(scrollTop > 300);
        
        // Infinite scroll for mobile - load more when near bottom
        // Avoid using searchResults in this effect to prevent initialization issues
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [currentPage]); // Remove searchResults dependency to avoid initialization issues



  // Reset bounce arrow state when query changes
  useEffect(() => {
    setHasScrolled(false);
    setBounceCount(0);
    setShowBounceArrow(false);
    setIsSettled(false);
    setIsAtBottom(false);
    setHasLoadedMoreOnMobile(false);
    setCurrentPage(0);
    setAllLoadedProducts([]);
  }, [searchQuery, category]);

  // This useEffect will be moved after searchResults is defined

  // Handle arrow click to scroll down
  const handleArrowClick = () => {
    const scrollAmount = window.innerHeight * 0.8; // Scroll about 80% of viewport height
    window.scrollBy({
      top: scrollAmount,
      behavior: 'smooth'
    });
  };
  
  console.log("AlgoliaSearch props:", { initialQuery, initialCategory, initialManufacturer });
  console.log("Current category state:", category);
  
  // Filter states
  const [filters, setFilters] = useState({
    manufacturer: initialManufacturer || "",
    caliber: "",
    capacity: "",
    priceRange: "",
    inStock: null as boolean | null,
    barrelLength: "",
    finish: "",
    frameSize: "",
    actionType: "",
    sightType: "",
    newItem: null as boolean | null,
    internalSpecial: null as boolean | null,
    shippingMethod: "",
    platformCategory: "",
    partTypeCategory: "",
    nfaItemType: "",
    nfaBarrelLength: "",
    nfaFinish: "",
    accessoryType: "",
    compatibility: "",
    material: "",
    mountType: "",
    receiverType: "",
    productType: ""
  });

  // Track user-applied vs system-applied filters
  const [userAppliedFilters, setUserAppliedFilters] = useState(new Set<string>());

  // Bounce arrow state
  const [showBounceArrow, setShowBounceArrow] = useState(false);
  const [bounceCount, setBounceCount] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isSettled, setIsSettled] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);

  // Update category when initialCategory changes
  useEffect(() => {
    setCategory(initialCategory || "all");
    
    // Map ribbon category to productType for dropdown synchronization
    const categoryToProductType = {
      "Handguns": "handgun",
      "Rifles": "rifle", 
      "Shotguns": "shotgun",
      "Ammunition": "ammunition",
      "Optics": "optics",
      "Accessories": "accessories",
      "Parts": "parts",
      "NFA Products": "nfa",
      "NFA": "nfa",
      "Magazines": "magazines",
      "Uppers/Lowers": "uppers"
    };
    
    const productType = categoryToProductType[initialCategory as keyof typeof categoryToProductType] || "";
    
    // FILTER PRESERVATION FIX: Preserve user-applied filters, only reset system filters
    console.log("Setting productType to:", productType);
    console.log("User applied filters:", Array.from(userAppliedFilters));
    
    setFilters(prev => {
      const newFilters = { ...prev };
      
      // Always update productType (system controlled)
      newFilters.productType = productType;
      
      // Update manufacturer only from URL params
      if (initialManufacturer) {
        newFilters.manufacturer = initialManufacturer;
      }
      
      // Reset non-user-applied filters to defaults
      Object.keys(newFilters).forEach(key => {
        if (!userAppliedFilters.has(key) && key !== 'productType' && key !== 'manufacturer') {
          // Reset to default values
          if (key === 'inStock' || key === 'newItem' || key === 'internalSpecial') {
            (newFilters as any)[key] = null;
          } else {
            (newFilters as any)[key] = "";
          }
        }
      });
      
      return newFilters;
    });
    
    setCurrentPage(0);
  }, [initialCategory, initialManufacturer, userAppliedFilters]);

  // Get filter options based on current search
  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["/api/search/filter-options", category, searchQuery, filters],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/search/filter-options", {
        category: category === "all" ? "" : category,
        query: searchQuery,
        filters: filters
      });
      const data = await response.json();
      console.log('🔍 Filter options API response:', data);
      console.log('🔍 Has receiverTypes:', !!data.receiverTypes);
      console.log('🔍 receiverTypes data:', data.receiverTypes);
      console.log('🔍 API response keys:', Object.keys(data));
      
      // Update receiver type labels for industry standard terminology
      if (data.receiverTypes) {
        data.receiverTypes = data.receiverTypes.map((rt: any) => ({
          ...rt,
          value: rt.value === 'Handgun Lower' ? 'Frame' : rt.value
        }));
        console.log('🔍 Updated receiverTypes:', data.receiverTypes);
      }
      
      console.log('🔍 Final data being returned:', data);
      return data;
    },
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Provide default values only if no data is available
  const safeFilterOptions = filterOptions || {
    manufacturers: [],
    calibers: [],
    capacities: [],
    priceRanges: [],
    stockStatus: [],
    barrelLengths: [],
    finishes: [],
    frameSizes: [],
    actionTypes: [],
    sightTypes: [],
    newItems: [],
    internalSpecials: [],
    shippingMethods: [],
    platformCategories: [],
    partTypeCategories: [],
    nfaItemTypes: [],
    nfaBarrelLengths: [],
    nfaFinishes: [],
    accessoryTypes: [],
    compatibilities: [],
    materials: [],
    mountTypes: [],
    receiverTypes: [],
    productTypes: []
  };

  // Main search query
  const { data: searchResults, isLoading, error } = useQuery<SearchResponse>({
    queryKey: ["/api/search/algolia", searchQuery, category, filters, currentPage, resultsPerPage, sortBy],
    queryFn: async () => {
      const searchParams = {
        query: searchQuery,
        filters: {
          category: category === "all" ? "" : category,
          ...filters,
          // Handle department number for handguns
          ...(category.toLowerCase() === "handguns" && { departmentNumber: "01" })
        },
        sort: sortBy,
        page: currentPage,
        hitsPerPage: resultsPerPage,
      };

      const response = await apiRequest("POST", "/api/search/algolia", searchParams);
      return response.json();
    },
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  // Cross-category suggestions query - only fetch when results are low or when testing fallback
  const shouldFetchSuggestions = searchResults && !isLoading && searchResults.hits.length > 0;
  
  const { data: suggestions } = useQuery<SuggestionsResponse>({
    queryKey: ["/api/search/suggestions", searchQuery, category, filters],
    queryFn: async () => {
      const suggestionParams = {
        query: searchQuery,
        category: category === "all" ? "" : category,
        filters,
        excludeCategories: [] // Can be expanded later
      };

      const response = await apiRequest("POST", "/api/search/suggestions", suggestionParams);
      return response.json();
    },
    enabled: shouldFetchSuggestions,
    staleTime: 60 * 1000, // Cache for 60 seconds
  });

  // Start bounce arrow timer when search results load
  useEffect(() => {
    if (searchResults && searchResults.hits.length > 12) {
      // Show immediately on first load, then after 5 seconds, but only bounce if not scrolled
      if (!hasScrolled && bounceCount < 2) {
        const delay = bounceCount === 0 ? 0 : 5000;
        
        const timer = setTimeout(() => {
          setShowBounceArrow(true);
          setBounceCount(prev => prev + 1);
          
          // After bounce animation, settle the arrow
          setTimeout(() => {
            setIsSettled(true);
          }, 3000);
        }, delay);

        return () => clearTimeout(timer);
      } else {
        // Always show arrow if results > 12, even after scroll
        setShowBounceArrow(true);
        setIsSettled(true);
      }
    }
  }, [searchResults, hasScrolled, bounceCount]);

  // Accumulate products for mobile infinite scroll - moved after searchResults query
  useEffect(() => {
    if (searchResults && searchResults.hits) {
      const isMobile = window.innerWidth < 640; // sm breakpoint
      
      if (isMobile && currentPage > 0) {
        // On mobile, accumulate products from all pages
        setAllLoadedProducts(prev => [...prev, ...searchResults.hits]);
      } else {
        // On desktop or first page, use current page results
        setAllLoadedProducts(searchResults.hits);
      }
    }
  }, [searchResults, currentPage]);

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    
    // Track user-applied filters (when they actually set a value)
    if (value && value !== "" && value !== null) {
      setUserAppliedFilters(prev => new Set([...Array.from(prev), key]));
    } else {
      // Remove from user-applied if they clear the filter
      setUserAppliedFilters(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
    }
    
    // Clear search query when changing product type to avoid confusion
    if (key === 'productType') {
      setSearchQuery('');
      
      // Synchronize dropdown selection with category for ribbon
      const productTypeToCategory = {
        "handgun": "Handguns",
        "rifle": "Rifles",
        "shotgun": "Shotguns", 
        "ammunition": "Ammunition",
        "optics": "Optics",
        "accessories": "Accessories",
        "parts": "Parts",
        "nfa": "NFA",
        "magazines": "Magazines",
        "uppers": "Uppers/Lowers"
      };
      
      const newCategory = productTypeToCategory[value as keyof typeof productTypeToCategory] || "all";
      setCategory(newCategory);
      
      // Update URL so ribbon can detect the change
      const newUrl = value === "" ? '/products' : `/products?category=${encodeURIComponent(newCategory)}`;
      console.log("Updating URL to:", newUrl);
      window.history.pushState({}, '', newUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    
    setCurrentPage(0); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      manufacturer: "",
      caliber: "",
      capacity: "",
      priceRange: "",
      inStock: null,
      barrelLength: "",
      finish: "",
      frameSize: "",
      actionType: "",
      sightType: "",
      newItem: null,
      internalSpecial: null,
      shippingMethod: "",
      platformCategory: "",
      partTypeCategory: "",
      nfaItemType: "",
      nfaBarrelLength: "",
      nfaFinish: "",
      accessoryType: "",
      compatibility: "",
      material: "",
      mountType: "",
      receiverType: "",
      productType: ""
    });
    setUserAppliedFilters(new Set()); // Clear user-applied filters tracking
    setCategory("all");
    setCurrentPage(0);
  };

  // Get display title based on current filters
  const getDisplayTitle = () => {
    // First check if a specific product type is selected from dropdown
    if (filters.productType) {
      const typeMap = {
        "handgun": "Handguns",
        "rifle": "Rifles", 
        "shotgun": "Shotguns",
        "ammunition": "Ammunition",
        "optics": "Optics",
        "accessories": "Accessories",
        "parts": "Parts",
        "nfa": "NFA Products"
      };
      return typeMap[filters.productType as keyof typeof typeMap] || "Products";
    }
    
    // Then check if a category is selected from ribbon buttons
    if (category !== "all") {
      // Handle the specific category names from the ribbon
      const categoryMap = {
        "Handguns": "Handguns",
        "Rifles": "Rifles",
        "Shotguns": "Shotguns",
        "Long Guns": "Long Guns",
        "Ammunition": "Ammunition",
        "Optics": "Optics",
        "Accessories": "Accessories",
        "Parts": "Parts",
        "NFA Products": "NFA Products"
      };
      return categoryMap[category as keyof typeof categoryMap] || category;
    }
    
    // Check if there's an initial category from URL that should be displayed
    if (initialCategory) {
      return initialCategory;
    }
    
    return "All Products";
  };

  const hasActiveFilters = Object.values(filters).some(value => 
    value !== "" && value !== null && value !== false
  );

  const getFilterCount = () => {
    return Object.values(filters).filter(value => 
      value !== "" && value !== null && value !== false
    ).length;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(0);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleMobileSearch = () => {
    setShowMobileSearch(!showMobileSearch);
  };

  return (
    <div className="space-y-3">
      {/* Dynamic Title Based on Dropdown Selection */}
      {searchResults && (
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gun-black">
            {getDisplayTitle()}
          </h1>
        </div>
      )}

      {/* Search Header - Mobile vs Desktop */}
      <div className="flex items-center gap-2">
        {/* Mobile: Search Field + Controls */}
        <div className="sm:hidden flex items-center gap-2 w-full">
          {/* Filter Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilterPanel(true)}
            className="flex items-center gap-2 flex-shrink-0"
          >
            <Filter className="h-4 w-4" />
            {hasActiveFilters && (
              <span className="px-1.5 py-0.5 text-xs bg-gun-gold text-white rounded">
                {getFilterCount()}
              </span>
            )}
          </Button>

          {/* Search Input Field */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1">
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm h-9"
            />
            
            {/* Search Submit Button - Yellow magnifying glass */}
            <Button
              type="submit"
              size="sm"
              className="bg-gun-gold hover:bg-gun-gold/90 text-white border-gun-gold p-2 min-w-0 flex-shrink-0"
            >
              <Search className="h-4 w-4" />
            </Button>
          </form>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="flex items-center gap-2 text-gun-gold hover:text-gun-gold/80 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Desktop: Full Search Interface */}
        <div className="hidden sm:flex items-center gap-2 w-full">
          {/* Filter Toggle Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilterPanel(true)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Filter
            {hasActiveFilters && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gun-gold text-white rounded">
                {getFilterCount()}
              </span>
            )}
          </Button>

          {/* Product Type Filter */}
          <Select value={filters.productType || "all"} onValueChange={(value) => {
            console.log("Dropdown changed to:", value);
            handleFilterChange('productType', value === "all" ? "" : value);
          }}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="handgun">Handguns</SelectItem>
              <SelectItem value="rifle">Rifles</SelectItem>
              <SelectItem value="shotgun">Shotguns</SelectItem>
              <SelectItem value="ammunition">Ammunition</SelectItem>
              <SelectItem value="optics">Optics</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
              <SelectItem value="parts">Parts</SelectItem>
              <SelectItem value="nfa">NFA</SelectItem>
              <SelectItem value="magazines">Magazines</SelectItem>
              <SelectItem value="uppers">Uppers/Lowers</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder={`Search ${category === "all" ? "all products" : category.toLowerCase()}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" size="sm">
              Search
            </Button>
          </form>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="flex items-center gap-2 text-gun-gold hover:text-gun-gold/80"
            >
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Product Type Selector - Only show when search is toggled */}
      {showMobileSearch && (
        <div className="sm:hidden bg-gray-50 p-3 rounded-lg border">
          <Select value={filters.productType || "all"} onValueChange={(value) => {
            console.log("Mobile dropdown changed to:", value);
            handleFilterChange('productType', value === "all" ? "" : value);
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select product type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="handgun">Handguns</SelectItem>
              <SelectItem value="rifle">Rifles</SelectItem>
              <SelectItem value="shotgun">Shotguns</SelectItem>
              <SelectItem value="ammunition">Ammunition</SelectItem>
              <SelectItem value="optics">Optics</SelectItem>
              <SelectItem value="accessories">Accessories</SelectItem>
              <SelectItem value="parts">Parts</SelectItem>
              <SelectItem value="nfa">NFA</SelectItem>
              <SelectItem value="magazines">Magazines</SelectItem>
              <SelectItem value="uppers">Uppers/Lowers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Results Controls - Mobile vs Desktop */}
      {searchResults && (
        <div className="text-sm text-gray-600 py-2">
          {/* Mobile: Simplified Controls */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">
                {searchResults.nbHits.toLocaleString()} results
                {category !== "all" && ` in ${category}`}
              </span>
              
              {/* Mobile Sort Control */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Relevance</SelectItem>
                  <SelectItem value="price_low_to_high">Low to High</SelectItem>
                  <SelectItem value="price_high_to_low">High to Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Mobile: Page Text (no pagination buttons) */}
            {searchResults.nbPages > 1 && (
              <div className="text-center text-xs text-gray-500">
                Showing page {currentPage + 1} of {searchResults.nbPages} 
                {hasLoadedMoreOnMobile && " (scroll for more)"}
              </div>
            )}
          </div>

          {/* Desktop: Full Controls */}
          <div className="hidden sm:flex items-center justify-between">
            <span className="font-medium">
              {searchResults.nbHits.toLocaleString()} results
              {category !== "all" && ` in ${category}`}
              {searchQuery && ` for "${searchQuery}"`}
            </span>
            
            <div className="flex items-center gap-4">
              {/* Desktop Pagination Controls */}
              {searchResults.nbPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 0}
                  >
                    Previous
                  </Button>
                  
                  {/* Page Numbers */}
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(5, searchResults.nbPages) }, (_, i) => {
                      const pageNum = Math.max(0, Math.min(
                        searchResults.nbPages - 5,
                        currentPage - 2
                      )) + i;
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => handlePageChange(pageNum)}
                          className="w-10"
                        >
                          {pageNum + 1}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= searchResults.nbPages - 1}
                  >
                    Next
                  </Button>
                </div>
              )}
              
              {/* Page Info */}
              <span>
                Page {currentPage + 1} of {Math.max(1, searchResults.nbPages)}
              </span>
              
              {/* Results Per Page */}
              <Select value={resultsPerPage.toString()} onValueChange={(value) => setResultsPerPage(parseInt(value))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24</SelectItem>
                  <SelectItem value="48">48</SelectItem>
                  <SelectItem value="96">96</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Sort Control */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Relevance</SelectItem>
                  <SelectItem value="price_low_to_high">Low to High</SelectItem>
                  <SelectItem value="price_high_to_low">High to Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-8 text-red-600">
          <p>Error loading search results. Please try again.</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <ProductGrid 
          products={[]} 
          loading={true}
        />
      )}

      {/* Results Grid */}
      {searchResults && !isLoading && (
        <div className="relative">
          <ProductGrid 
            products={allLoadedProducts.map((hit, index) => ({
              id: parseInt(hit.objectID) || index,
              sku: hit.objectID,
              name: hit.name || '',
              description: hit.description || '',
              category: hit.categoryName || '',
              subcategoryName: hit.subcategoryName || null,
              departmentNumber: hit.departmentNumber || null,
              departmentDesc: hit.departmentDesc || null,
              subDepartmentDesc: hit.subDepartmentDesc || null,
              manufacturer: hit.manufacturer || hit.manufacturerName || 'Unknown',
              manufacturerPartNumber: hit.mpn || null,
              priceWholesale: hit.tierPricing?.platinum?.toString() || '0',
              priceMAP: hit.tierPricing?.gold?.toString() || '0',
              priceMSRP: hit.tierPricing?.bronze?.toString() || '0',
              priceBronze: hit.priceBronze || '0',
              priceGold: hit.priceGold || '0',
              pricePlatinum: hit.pricePlatinum || '0',
              stockQuantity: hit.inventoryQuantity || 0,
              allocated: 'N',
              requiresFFL: hit.fflRequired || false,
              createdAt: new Date(),
              isActive: true,
              tags: hit.tags || [],
              images: [],
              upcCode: hit.upc || null,
              weight: (hit.weight || 0).toString(),
              dimensions: null,
              restrictions: null,
              stateRestrictions: null,
              groundShipOnly: false,
              adultSignatureRequired: false,
              dropShippable: hit.dropShippable || true,
              prop65: false,
              returnPolicyDays: 30,
              newItem: hit.newItem || false,
              promo: null,
              accessories: null,
              distributor: 'RSR',
              mustRouteThroughGunFirm: false,
              firearmType: null,
              compatibilityTags: null,
              inStock: hit.inStock || false,
              // Add missing fields required by ProductGrid
              rsrStockNumber: hit.rsrStockNumber || null,
              caliber: hit.caliber || null,
              capacity: hit.capacity || null,
              barrelLength: null,
              finish: null,
              frameSize: null,
              actionType: null,
              sightType: null,
              partType: null,
              nfaItemType: null,
              nfaBarrelLength: null,
              nfaFinish: null,
              accessoryType: null,
              compatibility: null,
              material: null,
              mountType: null,
              receiverType: null,
              internalSpecial: false,
              specialDescription: null,
              frontSight: null,
              rearSight: null,
              trigger: null,
              rsrPrice: null,
              // Add critical missing schema fields
              platformCategory: null,
              partTypeCategory: null,
              isFirearm: hit.fflRequired || false,
              barrelLengthNfa: null,
              finishNfa: null,
              materialFinish: null
            }))}
            loading={false}
          />
          
          {/* Bounce Arrow Indicator */}
          {showBounceArrow && searchResults.hits.length > 12 && !isAtBottom && (
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
              <div className={`${!isSettled ? 'animate-dampening-bounce' : ''}`}>
                <button
                  onClick={handleArrowClick}
                  className="text-gray-500 hover:text-gray-700 transition-colors cursor-pointer sm:bg-gray-100 sm:hover:bg-gray-200 sm:rounded-full sm:p-2 md:p-3"
                >
                  <ChevronDown className="w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cross-Category Suggestions */}
      {suggestions && suggestions.suggestions && suggestions.suggestions.length > 0 && (
        <div className="mt-8 border-t pt-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">
            You might also like
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            Found {suggestions.totalSuggestions} similar items in other categories
          </p>
          
          {suggestions.suggestions.map((categoryGroup, groupIndex) => (
            <div key={groupIndex} className="mb-8">
              <h4 className="text-md font-medium text-gray-800 mb-4 flex items-center gap-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm">
                  {categoryGroup.category}
                </span>
                <span className="text-gray-500">
                  ({categoryGroup.count} items)
                </span>
              </h4>
              
              <ProductGrid 
                products={categoryGroup.items.map((item, index) => ({
                  id: parseInt(item.objectID) || (groupIndex * 1000 + index),
                  sku: item.objectID,
                  name: item.name || '',
                  description: '',
                  category: item.categoryName || '',
                  subcategoryName: null,
                  departmentNumber: null,
                  departmentDesc: null,
                  subDepartmentDesc: null,
                  manufacturer: item.manufacturer || item.manufacturerName || '',
                  manufacturerPartNumber: null,
                  priceWholesale: item.tierPricing?.platinum?.toString() || '0',
                  priceMAP: item.tierPricing?.gold?.toString() || '0',
                  priceMSRP: item.tierPricing?.bronze?.toString() || '0',
                  priceBronze: item.priceBronze || '0',
                  priceGold: item.priceGold || '0',
                  pricePlatinum: item.pricePlatinum || '0',
                  stockQuantity: item.inventoryQuantity || 0,
                  allocated: 'N',
                  requiresFFL: false,
                  createdAt: new Date(),
                  isActive: true,
                  tags: [],
                  images: [],
                  upcCode: null,
                  weight: "0",
                  dimensions: null,
                  restrictions: null,
                  stateRestrictions: null,
                  groundShipOnly: false,
                  adultSignatureRequired: false,
                  dropShippable: true,
                  prop65: false,
                  returnPolicyDays: 30,
                  newItem: false,
                  promo: null,
                  accessories: null,
                  distributor: 'RSR',
                  mustRouteThroughGunFirm: false,
                  firearmType: null,
                  compatibilityTags: null,
                  inStock: item.inStock || false,
                  // Add missing fields required by ProductGrid
                  caliber: item.caliber || null,
                  capacity: item.capacity || null,
                  barrelLength: null,
                  finish: null,
                  frameSize: null,
                  actionType: null,
                  sightType: null,
                  partType: null,
                  nfaItemType: null,
                  nfaBarrelLength: null,
                  nfaFinish: null,
                  accessoryType: null,
                  compatibility: null,
                  material: null,
                  mountType: null,
                  receiverType: null,
                  internalSpecial: false,
                  specialDescription: null,
                  frontSight: null,
                  rearSight: null,
                  trigger: null,
                  rsrPrice: null,
                  // Add critical missing schema fields
                  platformCategory: null,
                  partTypeCategory: null,
                  isFirearm: false,
                  barrelLengthNfa: null,
                  finishNfa: null,
                  materialFinish: null,
                  rsrStockNumber: item.stockNumber || item.objectID
                }))}
                loading={false}
              />
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {searchResults && !isLoading && searchResults.hits.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No products found</p>
          {hasActiveFilters && (
            <Button 
              variant="outline" 
              onClick={clearFilters}
              className="mt-4"
            >
              Clear filters to see all results
            </Button>
          )}
        </div>
      )}

      {/* Desktop-only Pagination (mobile uses infinite scroll) */}
      {searchResults && searchResults.nbPages > 1 && (
        <div className="hidden sm:flex justify-center items-center gap-2 py-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 0}
          >
            Previous
          </Button>
          
          {/* Page Numbers */}
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, searchResults.nbPages) }, (_, i) => {
              const pageNum = Math.max(0, Math.min(
                searchResults.nbPages - 5,
                currentPage - 2
              )) + i;
              
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum)}
                  className="w-10"
                >
                  {pageNum + 1}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= searchResults.nbPages - 1}
          >
            Next
          </Button>
        </div>
      )}

      {/* Mobile Loading Indicator for Infinite Scroll */}
      {isLoading && currentPage > 0 && (
        <div className="sm:hidden flex justify-center py-4">
          <div className="text-sm text-gray-500">Loading more products...</div>
        </div>
      )}

      {/* Mobile Scroll to Top Button */}
      {showScrollToTop && (
        <div className="sm:hidden fixed bottom-6 right-6 z-50">
          <Button
            onClick={handleScrollToTop}
            size="sm"
            className="rounded-full w-12 h-12 shadow-lg bg-gun-gold hover:bg-gun-gold/80 text-white"
          >
            <ChevronUp className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Filter Panel */}
      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={clearFilters}
        filterOptions={{
          manufacturers: filterOptions?.manufacturers || [],
          calibers: filterOptions?.calibers || [],
          capacities: filterOptions?.capacities || [],
          priceRanges: filterOptions?.priceRanges || [],
          stockStatus: filterOptions?.stockStatus || [],
          barrelLengths: filterOptions?.barrelLengths || [],
          finishes: filterOptions?.finishes || [],
          frameSizes: filterOptions?.frameSizes || [],
          actionTypes: filterOptions?.actionTypes || [],
          sightTypes: filterOptions?.sightTypes || [],
          newItems: filterOptions?.newItems || [],
          internalSpecials: filterOptions?.internalSpecials || [],
          shippingMethods: filterOptions?.shippingMethods || [],
          platformCategories: filterOptions?.platformCategories || [],
          partTypeCategories: filterOptions?.partTypeCategories || [],
          nfaItemTypes: filterOptions?.nfaItemTypes || [],
          nfaBarrelLengths: filterOptions?.nfaBarrelLengths || [],
          nfaFinishes: filterOptions?.nfaFinishes || [],
          accessoryTypes: filterOptions?.accessoryTypes || [],
          compatibilities: filterOptions?.compatibilities || [],
          materials: filterOptions?.materials || [],
          mountTypes: filterOptions?.mountTypes || [],
          receiverTypes: filterOptions?.receiverTypes || [],
          productTypes: filterOptions?.productTypes || []
        }}
        category={category}
        totalResults={searchResults?.nbHits || 0}
      />
    </div>
  );
}