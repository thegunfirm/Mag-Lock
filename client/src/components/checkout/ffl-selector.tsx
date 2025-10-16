import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Search, Building, Phone, CheckCircle, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface FFL {
  id: number;
  businessName: string;
  licenseNumber: string;
  contactEmail?: string;
  phone?: string;
  address: any;
  zip: string;
  status: 'NotOnFile' | 'OnFile' | 'Preferred';
  tradeNameDba?: string;
  isRsrPartner: boolean;
}

interface FflSelectorProps {
  selectedFflId: number | null;
  onFflSelected: (fflId: number | null) => void;
  userZip: string;
}

export function FflSelector({ selectedFflId, onFflSelected, userZip }: FflSelectorProps) {
  const [searchZip, setSearchZip] = useState(userZip || '');
  const [searchRadius, setSearchRadius] = useState(25);
  const [isSearching, setIsSearching] = useState(false);
  const [displayCount, setDisplayCount] = useState(10);

  const { data: ffls, isLoading, refetch } = useQuery({
    queryKey: ['/api/ffls/search', searchZip, searchRadius],
    queryFn: async () => {
      if (!searchZip.trim()) return [];
      console.log(`🔍 FFL Search: ${searchZip} within ${searchRadius} miles`);
      const response = await apiRequest('GET', `/api/ffls/search/${searchZip}?radius=${searchRadius}`);
      const data = await response.json();
      console.log(`📍 Found ${data.length} FFLs:`, data.slice(0, 3));
      return data;
    },
    enabled: !!searchZip.trim(),
  });

  // Get selected FFL details
  const { data: selectedFflDetails, isLoading: isLoadingSelected, error: selectedFflError } = useQuery({
    queryKey: ['/api/ffls', selectedFflId],
    queryFn: async () => {
      if (!selectedFflId) return null;
      console.log('🔍 Fetching FFL details for ID:', selectedFflId);
      const response = await apiRequest('GET', `/api/ffls/${selectedFflId}`);
      const data = await response.json();
      console.log('✅ FFL details received:', data);
      return data;
    },
    enabled: !!selectedFflId,
    retry: 1,
    retryDelay: 500,
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  const handleSearch = async () => {
    if (!searchZip.trim()) return;
    setIsSearching(true);
    setDisplayCount(10); // Reset display count on new search
    await refetch();
    setIsSearching(false);
  };

  const loadMore = () => {
    setDisplayCount(prev => prev + 10);
  };

  const formatAddress = (ffl: FFL) => {
    const { address, zip } = ffl;
    return `${address.street}, ${address.city}, ${address.state} ${zip}`;
  };

  const getStatusInfo = (status: string, isRsrPartner: boolean) => {
    if (status === 'OnFile' || isRsrPartner) {
      return { label: 'On File', color: 'bg-green-100 text-green-800', icon: CheckCircle };
    }
    if (status === 'Preferred') {
      return { label: 'Preferred', color: 'bg-blue-100 text-blue-800', icon: CheckCircle };
    }
    return { label: 'Not On File', color: 'bg-yellow-100 text-yellow-800', icon: Building };
  };

  const displayedFfls = ffls?.slice(0, displayCount) || [];
  const hasMore = ffls && ffls.length > displayCount;

  return (
    <Card className="bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="w-5 h-5 text-amber-600" />
          Select Your FFL Dealer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Show selected FFL if one is chosen */}
        {selectedFflId && isLoadingSelected && (
          <div className="p-4 border rounded-lg bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="animate-spin w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full"></div>
              <span>Loading FFL details...</span>
            </div>
          </div>
        )}
        
        {selectedFflId && !isLoadingSelected && selectedFflDetails && (
          <div className="space-y-4">
            {/* Success confirmation */}
            <div className="p-4 border-2 border-green-500 bg-green-50 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-green-800">FFL Dealer Selected</h3>
                  <p className="text-sm text-green-600">You can now proceed to checkout</p>
                </div>
              </div>
              
              <div className="ml-9">
                <h4 className="font-medium text-gray-900 mb-1">
                  {selectedFflDetails.tradeNameDba || selectedFflDetails.businessName}
                </h4>
                
                <div className="flex items-center gap-2 mb-2">
                  {(() => {
                    const statusInfo = getStatusInfo(selectedFflDetails.status, selectedFflDetails.isRsrPartner);
                    const StatusIcon = statusInfo.icon;
                    return (
                      <Badge className={`text-xs ${statusInfo.color}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    );
                  })()}
                </div>
                
                {selectedFflDetails.tradeNameDba && (
                  <p className="text-xs text-gray-600 mb-1">{selectedFflDetails.businessName}</p>
                )}
                
                <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                  <MapPin className="w-4 h-4" />
                  <span>{formatAddress(selectedFflDetails)}</span>
                </div>
                
                {selectedFflDetails.phone && (
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <span>{selectedFflDetails.phone}</span>
                  </div>
                )}
                
                <p className="text-xs text-gray-500 mt-2">License: {selectedFflDetails.licenseNumber}</p>
                
                {(selectedFflDetails.status === 'OnFile' || selectedFflDetails.isRsrPartner) && (
                  <p className="text-xs text-blue-600 mt-2">
                    ✓ The FFL is already on file for faster processing
                  </p>
                )}
              </div>
            </div>
            
            <Button 
              variant="outline" 
              onClick={() => onFflSelected(null)} 
              className="w-full"
            >
              Change FFL Dealer
            </Button>
          </div>
        )}
        
        {/* Search Interface - Only show if no FFL is selected */}
        {!selectedFflId && (
          <div className="space-y-4">
            <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter ZIP code to find FFLs near you"
                    value={searchZip}
                    onChange={(e) => setSearchZip(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} disabled={searchZip.length < 5 || isSearching}>
                    <Search className="w-4 h-4 mr-2" />
                    {isSearching ? 'Searching...' : 'Search'}
                  </Button>
                </div>
              </div>

            {/* Loading State - Only show if no FFL is selected */}
            {(isLoading || isSearching) && (
              <div className="text-center py-4">
                <div className="animate-spin w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Searching for FFLs...</p>
              </div>
            )}

            {/* Results - Only show if no FFL is selected */}
            {ffls && ffls.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{ffls.length} FFL dealers found near {searchZip}</p>
                
                <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                  <div className="space-y-3">
                    {displayedFfls.map((ffl: FFL) => {
                      const statusInfo = getStatusInfo(ffl.status, ffl.isRsrPartner);
                      const StatusIcon = statusInfo.icon;
                      
                      return (
                        <div 
                          key={ffl.id} 
                          className="p-3 border rounded-lg hover:border-amber-300 hover:bg-amber-50 cursor-pointer transition-colors"
                          onClick={() => onFflSelected(ffl.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-gray-900 truncate">
                                  {ffl.tradeNameDba || ffl.businessName}
                                </h4>
                                <Badge className={`text-xs ${statusInfo.color}`}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {statusInfo.label}
                                </Badge>
                              </div>
                              
                              {ffl.tradeNameDba && (
                                <p className="text-xs text-gray-600 mb-1">{ffl.businessName}</p>
                              )}
                              
                              <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{formatAddress(ffl)}</span>
                              </div>
                              
                              {ffl.phone && (
                                <div className="flex items-center gap-1 text-sm text-gray-600">
                                  <Phone className="w-4 h-4 flex-shrink-0" />
                                  <span>{ffl.phone}</span>
                                </div>
                              )}
                              
                              <p className="text-xs text-gray-500 mt-1">License: {ffl.licenseNumber}</p>
                              
                              {(ffl.status === 'OnFile' || ffl.isRsrPartner) && (
                                <p className="text-xs text-blue-600 mt-1">
                                  ✓ The FFL is already on file for faster processing
                                </p>
                              )}
                            </div>
                            
                            <Button 
                              size="sm" 
                              className="ml-3 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onFflSelected(ffl.id);
                              }}
                            >
                              Select
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    
                    {hasMore && (
                      <div className="pt-4">
                        <Button 
                          variant="outline" 
                          onClick={loadMore}
                          className="w-full"
                        >
                          <ChevronDown className="w-4 h-4 mr-2" />
                          Load More FFLs ({ffls.length - displayCount} remaining)
                        </Button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* No Results - Only show if no FFL is selected */}
            {searchZip && ffls && ffls.length === 0 && !isLoading && !isSearching && (
              <div className="text-center py-8">
                <Building className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No FFLs found</h3>
                <p className="text-gray-600 mb-4">
                  We couldn't find any FFL dealers near ZIP code {searchZip}.
                </p>
                <p className="text-sm text-gray-500">
                  Try searching with a different ZIP code or contact us for assistance.
                </p>
              </div>
            )}
          </div>
        )}
        
        {selectedFflId && !isLoadingSelected && selectedFflError && (
          <div className="p-4 border rounded-lg bg-red-50 text-red-700">
            Failed to load FFL details. Please try selecting again.
            <br />
            <small className="text-red-600">Error: {selectedFflError.message}</small>
          </div>
        )}
      </CardContent>
    </Card>
  );
}