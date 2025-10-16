import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { User, Menu, X, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { CartIcon } from "@/components/cart/cart-icon";
import { CartSheet } from "@/components/cart/cart-sheet";

const categories = [
  "Handguns",
  "Rifles", 
  "Shotguns",
  "Ammunition",
  "Optics",
  "Parts",
  "Safety",
  "Accessories"
];

export function Header() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Simple flag to disable ribbon - set to true to re-enable
  const SHOW_CATEGORY_RIBBON = true;

  const handleCategoryClick = (category: string) => {
    console.log("Header category click:", category);
    const newUrl = `/products?category=${encodeURIComponent(category)}`;
    console.log("Navigating to:", newUrl);
    window.history.pushState({}, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="bg-black text-white shadow-lg sticky top-0 z-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[120px_1fr_120px] items-center h-20">
          {/* Logo - Left */}
          <div className="justify-self-start self-center">
            <Link href="/">
              <Logo className="hover:opacity-80 transition-opacity cursor-pointer h-16 w-auto sm:h-18 md:h-20 lg:h-22 object-contain" />
            </Link>
          </div>

          {/* Category Links - Center */}
          {SHOW_CATEGORY_RIBBON ? (
            /* Static Category Links */
            <div className="hidden lg:flex justify-center items-center gap-3 xl:gap-4 2xl:gap-5 whitespace-nowrap w-full">
              <Link href="/products">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer font-medium text-sm xl:text-base 2xl:text-lg">
                  Browse All
                </span>
              </Link>
              <Link href="/products?category=Handguns">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Handguns
                </span>
              </Link>
              <Link href="/products?category=Rifles">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Rifles
                </span>
              </Link>
              <Link href="/products?category=Shotguns">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Shotguns
                </span>
              </Link>
              <Link href="/products?category=Ammunition">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Ammunition
                </span>
              </Link>
              <Link href="/products?category=NFA">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  NFA
                </span>
              </Link>
              <Link href="/products?category=Magazines">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Magazines
                </span>
              </Link>
              <Link href="/products?category=Uppers/Lowers">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Uppers/Lowers
                </span>
              </Link>
              <Link href="/products?category=Optics">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Optics
                </span>
              </Link>
              <Link href="/products?category=Parts">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Parts
                </span>
              </Link>
              <Link href="/products?category=Accessories">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer text-sm xl:text-base 2xl:text-lg">
                  Accessories
                </span>
              </Link>
            </div>
          ) : (
            /* Simple Navigation Links */
            <div className="hidden lg:flex justify-center items-center gap-6">
              <Link href="/products">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer font-medium">
                  Browse All
                </span>
              </Link>
              <Link href="/">
                <span className="text-white hover:text-yellow-400 transition-colors cursor-pointer">
                  <Search className="h-5 w-5" />
                </span>
              </Link>
            </div>
          )}

          {/* Navigation Icons - Right */}
          <div className="justify-self-end flex items-center space-x-1 sm:space-x-2 md:space-x-4">
            {user ? (
              <Link href="/account">
                <Button variant="ghost" size="sm" className="text-white hover:text-gun-gold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <div className="hidden md:flex flex-col items-start text-xs leading-tight">
                    <span className="font-medium">{user.firstName}</span>
                    <span className="text-gun-gold capitalize">{user.membershipTier || 'Bronze'}</span>
                  </div>
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-white hover:text-gun-gold">
                  <User className="h-5 w-5" />
                  <span className="hidden md:inline ml-1">Sign In</span>
                </Button>
              </Link>
            )}
            <CartIcon />
            
            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden text-white hover:text-gun-gold"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>



        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gun-gray">
            {/* Mobile Quick Links */}
            <div className="p-4 space-y-3">
              <Link href="/products">
                <div 
                  className="text-white hover:text-yellow-400 transition-colors cursor-pointer py-2"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Browse All
                </div>
              </Link>
              <Link href="/">
                <div 
                  className="text-white hover:text-yellow-400 transition-colors cursor-pointer py-2 flex items-center"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </div>
              </Link>
            </div>
            
            {/* Mobile Categories (disabled when ribbon is off) */}
            {SHOW_CATEGORY_RIBBON && (
              <div className="grid grid-cols-2 gap-2 p-4 border-t border-gun-gray">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => handleCategoryClick(category)}
                    className="text-left p-2 text-white hover:text-gun-gold hover:bg-gun-gray rounded transition-colors duration-200"
                  >
                    {category}
                  </button>
                ))}
              </div>
            )}

            {/* Mobile Auth Links */}
            <div className="border-t border-gun-gray p-4 space-y-2">
              {user ? (
                <div className="text-gun-gray-light">
                  Welcome, {user.firstName}!
                </div>
              ) : (
                <div className="space-y-2">
                  <Link href="/login">
                    <Button variant="outline" className="w-full">
                      Sign In
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button className="w-full bg-gun-gold hover:bg-gun-gold-bright text-gun-black">
                      Register
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Cart Sheet */}
      <CartSheet />
    </header>
  );
}
