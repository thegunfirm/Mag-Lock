// Static category ribbon - no API calls
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface CategoryRibbon {
  id: number;
  categoryName: string;
  displayName: string;
}

// Static category configuration
const STATIC_RIBBONS: CategoryRibbon[] = [
  { id: 1, categoryName: 'Handguns', displayName: 'Handguns' },
  { id: 2, categoryName: 'Rifles', displayName: 'Rifles' },
  { id: 3, categoryName: 'Shotguns', displayName: 'Shotguns' },
  { id: 4, categoryName: 'Ammunition', displayName: 'AMMO' },
  { id: 5, categoryName: 'Optics', displayName: 'Optics' },
  { id: 6, categoryName: 'Parts', displayName: 'Parts' },
  { id: 7, categoryName: 'NFA', displayName: 'NFA' },
  { id: 8, categoryName: 'Accessories', displayName: 'Accessories' },
  { id: 9, categoryName: 'Magazines', displayName: 'Magazines' },
  { id: 10, categoryName: 'Uppers/Lowers', displayName: 'Uppers/Lowers' },
];

export function CategoryRibbon() {
  const [location, setLocation] = useLocation();
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);

  // Update current category when URL changes
  useEffect(() => {
    const updateCategory = () => {
      const category = new URLSearchParams(window.location.search).get('category');
      setCurrentCategory(category);
    };
    
    updateCategory();
    window.addEventListener('popstate', updateCategory);
    
    return () => window.removeEventListener('popstate', updateCategory);
  }, [location]);

  const ribbons = STATIC_RIBBONS;

  const handleCategoryClick = (categoryName: string) => {
    console.log("CategoryRibbon click:", categoryName);
    const newUrl = `/products?category=${encodeURIComponent(categoryName)}`;
    console.log("Navigating to:", newUrl);
    window.history.pushState({}, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    
    // Scroll to top of the page when category changes
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // No loading state needed for static ribbons
  if (!ribbons || ribbons.length === 0) {
    return null;
  }

  return (
    <>
      {/* Mobile: Single Browse Button */}
      <div className="sm:hidden bg-black flex items-center justify-center px-4 py-2">
        <button
          onClick={() => setLocation('/browse')}
          className="py-2 px-4 text-center text-white hover:text-gun-gold hover:bg-gun-black transition-all duration-200 font-bebas text-sm tracking-wide uppercase"
        >
          Browse Categories
        </button>
      </div>
      
      {/* Tablet/Desktop: Full Ribbon */}
      <div className="hidden sm:flex bg-black flex-wrap items-end justify-center xl:justify-start gap-1 px-1 sm:px-2 py-1 max-w-full">
        {ribbons.map((ribbon, index) => {
          // Individual button styling based on category with better responsive scaling
          let buttonClass = "py-1 px-1 sm:px-2 md:py-2 md:px-3 text-center text-white hover:text-gun-gold hover:bg-gun-black transition-all duration-200 font-bebas text-xs sm:text-sm md:text-sm tracking-wide uppercase whitespace-nowrap flex-shrink-0";
          
          // No borders - using gap spacing instead
          
          // Active state
          if (currentCategory === ribbon.categoryName) {
            buttonClass += " text-gun-gold";
          }
          
          return (
            <button
              key={ribbon.id}
              onClick={() => handleCategoryClick(ribbon.categoryName)}
              className={buttonClass}
            >
              {ribbon.displayName}
            </button>
          );
        })}
      </div>
    </>
  );
}