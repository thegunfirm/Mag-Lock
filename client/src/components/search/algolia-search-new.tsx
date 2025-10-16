import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductGrid } from "@/components/product/product-grid";
import { FilterPanel } from "@/components/search/filter-panel";
import { Search, Filter, X } from "lucide-react";
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
  sku: string;
  manufacturerName: string;
  categoryName: string;
  tierPricing: {
    bronze: number;
    gold: number;
    platinum: number;
  };
  inventory: {
    onHand: number;
    allocated: boolean;
  };
  images: Array<{
    image: string;
    id: string;
  }>;
  inStock: boolean;
  distributor: string;
  caliber?: string;
  capacity?: number;
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
}

export function AlgoliaSearch({ initialQuery = "", initialCategory = "", initialManufacturer = "" }: AlgoliaSearchProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory || "all");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [resultsPerPage] = useState(24);
  
  console.log("AlgoliaSearch props:", { initialQuery, initialCategory, initialManufacturer });
  console.log("Current category state:", category);
  
  // Filter states
  const [filters, setFilters] = useState({
    manufacturer: initialManufacturer || "",
    caliber: "",
    capacity: "",
    priceRange: "",
    inStock: null as boolean | null
  });

  // Update category when initialCategory changes
  useEffect(() => {
    if (initialCategory !== category) {
      setCategory(initialCategory || "all");
      // Reset filters when category changes
      setFilters({
        manufacturer: initialManufacturer || "",
        caliber: "",
        capacity: "",
        priceRange: "",
        inStock: null
      });
      setCurrentPage(0);
    }
  }, [initialCategory, initialManufacturer, category]);

  // Get filter options based on current search
  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["/api/search/filter-options", category, searchQuery, filters],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/search/filter-options", {
        category: category === "all" ? "" : category,
        query: searchQuery,
        filters: {
          ...filters,
          // Don't include the filter we're getting options for
          manufacturer: "",
          caliber: "",
          capacity: "",
          priceRange: "",
          inStock: null
        }
      });
      return response.json();
    },
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  // Main search query
  const { data: searchResults, isLoading, error } = useQuery<SearchResponse>({
    queryKey: ["/api/search/algolia", searchQuery, category, filters, currentPage, resultsPerPage],
    queryFn: async () => {
      const searchParams = {
        query: searchQuery,
        filters: {
          category: category === "all" ? "" : category,
          ...filters,
          // Handle department number for handguns
          ...(category.toLowerCase() === "handguns" && { departmentNumber: "01" })
        },
        sort: "relevance",
        page: currentPage,
        hitsPerPage: resultsPerPage,
      };

      const response = await apiRequest("POST", "/api/search/algolia", searchParams);
      return response.json();
    },
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setCurrentPage(0); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      manufacturer: "",
      caliber: "",
      capacity: "",
      priceRange: "",
      inStock: null
    });
    setCurrentPage(0);
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

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="flex items-center gap-3">
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
            Clear Filters
          </Button>
        )}
      </div>

      {/* Results Summary */}
      {searchResults && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            {searchResults.nbHits.toLocaleString()} results
            {category !== "all" && ` in ${category}`}
            {searchQuery && ` for "${searchQuery}"`}
          </span>
          <span>
            Page {currentPage + 1} of {Math.max(1, searchResults.nbPages)}
          </span>
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
          products={Array(12).fill(null)} 
          isLoading={true}
        />
      )}

      {/* Results Grid */}
      {searchResults && !isLoading && (
        <ProductGrid 
          products={searchResults.hits}
          isLoading={false}
        />
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

      {/* Pagination */}
      {searchResults && searchResults.nbPages > 1 && (
        <div className="flex justify-center items-center gap-2 py-8">
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

      {/* Filter Panel */}
      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={clearFilters}
        filterOptions={filterOptions || {
          manufacturers: [],
          calibers: [],
          capacities: [],
          priceRanges: [],
          stockStatus: []
        }}
        category={category}
        totalResults={searchResults?.nbHits || 0}
      />
    </div>
  );
}