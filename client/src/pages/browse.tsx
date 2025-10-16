import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CategoryRibbon {
  id: number;
  categoryName: string;
  displayName: string;
}

// Static category configuration - same as in category-ribbon.tsx
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

export default function Browse() {
  const [, setLocation] = useLocation();

  const ribbons = STATIC_RIBBONS;

  const handleCategoryClick = (categoryName: string) => {
    const newUrl = `/products?category=${encodeURIComponent(categoryName)}`;
    setLocation(newUrl);
  };

  const handleBackClick = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBackClick}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <h1 className="text-xl font-bold text-gun-black">Browse Categories</h1>
          </div>
        </div>
      </div>

      {/* Category Grid */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-3">
          {ribbons?.map((ribbon) => (
            <button
              key={ribbon.id}
              onClick={() => handleCategoryClick(ribbon.categoryName)}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 text-left hover:shadow-md hover:border-gun-gold transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-medium text-gun-black font-bebas tracking-wide uppercase">
                  {ribbon.displayName}
                </span>
                <span className="text-gray-400">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}