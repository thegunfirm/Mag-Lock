import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlgoliaSearch } from "@/components/search/algolia-search";

export default function Products() {
  const [location] = useLocation();
  const [, forceUpdate] = useState({});
  
  // Function to get current URL params
  const getUrlParams = () => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    return {
      query: params.get('search') || "",
      category: params.get('category') || "",
      manufacturer: params.get('manufacturer') || ""
    };
  };
  
  const [urlParams, setUrlParams] = useState(getUrlParams());
  
  // Update params whenever we detect a change
  const updateParams = () => {
    const newParams = getUrlParams();
    setUrlParams(newParams);
    forceUpdate({});
    console.log("Products page updated with params:", newParams);
  };
  
  // Listen to wouter location changes
  useEffect(() => {
    updateParams();
  }, [location]);
  
  // Listen for popstate events (back/forward navigation)
  useEffect(() => {
    window.addEventListener('popstate', updateParams);
    return () => window.removeEventListener('popstate', updateParams);
  }, []);
  
  // Listen for pushstate/replacestate (programmatic navigation)
  useEffect(() => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    window.history.pushState = function(...args) {
      originalPushState.apply(window.history, args);
      setTimeout(updateParams, 0);
    };
    
    window.history.replaceState = function(...args) {
      originalReplaceState.apply(window.history, args);
      setTimeout(updateParams, 0);
    };
    
    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">


        {/* Enhanced Algolia Search Component */}
        <AlgoliaSearch 
          key={`${urlParams.query}-${urlParams.category}-${urlParams.manufacturer}`}
          initialQuery={urlParams.query}
          initialCategory={urlParams.category}
          initialManufacturer={urlParams.manufacturer}
        />
      </div>
    </div>
  );
}
