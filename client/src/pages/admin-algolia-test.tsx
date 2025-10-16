import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  Search,
  Database,
  Key,
  Activity
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface AlgoliaTestResults {
  appId: string;
  searchApiStatus: 'success' | 'error';
  searchApiError?: string;
  adminApiStatus: 'success' | 'error';
  adminApiError?: string;
  indexStatus: 'success' | 'error';
  indexError?: string;
  indexCount?: number;
  testSearchStatus: 'success' | 'error';
  testSearchError?: string;
  testSearchResults?: number;
  overallStatus: 'healthy' | 'partial' | 'failed';
  timestamp: string;
}

interface HealthCheck {
  status: 'healthy' | 'unhealthy';
  message: string;
}

const StatusIcon = ({ status }: { status: 'success' | 'error' }) => {
  return status === 'success' ? (
    <CheckCircle className="h-5 w-5 text-green-500" />
  ) : (
    <XCircle className="h-5 w-5 text-red-500" />
  );
};

const StatusBadge = ({ status }: { status: 'healthy' | 'partial' | 'failed' | 'unhealthy' }) => {
  const variants = {
    healthy: { variant: "default" as const, className: "bg-green-500" },
    partial: { variant: "secondary" as const, className: "bg-yellow-500" },
    failed: { variant: "destructive" as const, className: "" },
    unhealthy: { variant: "destructive" as const, className: "" }
  };
  
  const config = variants[status] || variants.failed;
  
  return (
    <Badge variant={config.variant} className={config.className}>
      {status.toUpperCase()}
    </Badge>
  );
};

export default function AdminAlgoliaTest() {
  const [activeTest, setActiveTest] = useState<'connectivity' | 'health' | null>(null);

  const connectivityQuery = useQuery({
    queryKey: ['algolia-connectivity-test'],
    queryFn: () => apiRequest('/api/admin/algolia-connectivity-test'),
    enabled: activeTest === 'connectivity',
    refetchOnWindowFocus: false
  });

  const healthQuery = useQuery({
    queryKey: ['algolia-health-check'],
    queryFn: () => apiRequest('/api/admin/algolia-health-check'),
    enabled: activeTest === 'health',
    refetchOnWindowFocus: false
  });

  const runConnectivityTest = () => {
    setActiveTest('connectivity');
    connectivityQuery.refetch();
  };

  const runHealthCheck = () => {
    setActiveTest('health');
    healthQuery.refetch();
  };

  const connectivityResults = connectivityQuery.data as AlgoliaTestResults;
  const healthResults = healthQuery.data as HealthCheck;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Algolia Connectivity Test</h1>
          <p className="text-muted-foreground">
            Test Algolia search service connectivity and functionality
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Full Connectivity Test
            </CardTitle>
            <CardDescription>
              Comprehensive test of all Algolia APIs and functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={runConnectivityTest} 
              disabled={connectivityQuery.isFetching}
              className="w-full"
              data-testid="button-run-connectivity-test"
            >
              {connectivityQuery.isFetching ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Running Test...
                </>
              ) : (
                <>
                  <Activity className="mr-2 h-4 w-4" />
                  Run Full Test
                </>
              )}
            </Button>

            {connectivityResults && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Overall Status</span>
                  <StatusBadge status={connectivityResults.overallStatus} />
                </div>
                
                <div className="text-sm text-muted-foreground">
                  App ID: <code className="bg-muted px-1 rounded">{connectivityResults.appId}</code>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  Test Time: {new Date(connectivityResults.timestamp).toLocaleString()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Quick Health Check
            </CardTitle>
            <CardDescription>
              Fast connectivity check for monitoring
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={runHealthCheck} 
              disabled={healthQuery.isFetching}
              variant="outline" 
              className="w-full"
              data-testid="button-run-health-check"
            >
              {healthQuery.isFetching ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Activity className="mr-2 h-4 w-4" />
                  Quick Check
                </>
              )}
            </Button>

            {healthResults && (
              <Alert className={healthResults.status === 'healthy' ? 'border-green-500' : 'border-red-500'}>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="flex items-center gap-2">
                  <StatusBadge status={healthResults.status} />
                </AlertTitle>
                <AlertDescription>
                  {healthResults.message}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {connectivityResults && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Test Results</CardTitle>
            <CardDescription>
              Comprehensive breakdown of all connectivity tests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="summary" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="apis">API Tests</TabsTrigger>
                <TabsTrigger value="functionality">Functionality</TabsTrigger>
              </TabsList>
              
              <TabsContent value="summary" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Search API</span>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={connectivityResults.searchApiStatus} />
                        <StatusBadge status={connectivityResults.searchApiStatus === 'success' ? 'healthy' : 'failed'} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Admin API</span>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={connectivityResults.adminApiStatus} />
                        <StatusBadge status={connectivityResults.adminApiStatus === 'success' ? 'healthy' : 'failed'} />
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>Index Access</span>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={connectivityResults.indexStatus} />
                        <StatusBadge status={connectivityResults.indexStatus === 'success' ? 'healthy' : 'failed'} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Search Function</span>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={connectivityResults.testSearchStatus} />
                        <StatusBadge status={connectivityResults.testSearchStatus === 'success' ? 'healthy' : 'failed'} />
                      </div>
                    </div>
                  </div>
                </div>

                {connectivityResults.indexCount !== undefined && (
                  <Alert>
                    <Database className="h-4 w-4" />
                    <AlertTitle>Index Statistics</AlertTitle>
                    <AlertDescription>
                      Products indexed: <strong data-testid="text-index-count">{connectivityResults.indexCount.toLocaleString()}</strong>
                    </AlertDescription>
                  </Alert>
                )}

                {connectivityResults.testSearchResults !== undefined && (
                  <Alert>
                    <Search className="h-4 w-4" />
                    <AlertTitle>Search Test Results</AlertTitle>
                    <AlertDescription>
                      Test search returned: <strong data-testid="text-search-results">{connectivityResults.testSearchResults.toLocaleString()}</strong> results
                    </AlertDescription>
                  </Alert>
                )}
              </TabsContent>

              <TabsContent value="apis" className="space-y-4">
                <div className="space-y-3">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        <CardTitle className="text-lg">Search API Key</CardTitle>
                        <StatusIcon status={connectivityResults.searchApiStatus} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {connectivityResults.searchApiStatus === 'error' && connectivityResults.searchApiError && (
                        <Alert variant="destructive">
                          <AlertDescription data-testid="text-search-api-error">
                            {connectivityResults.searchApiError}
                          </AlertDescription>
                        </Alert>
                      )}
                      {connectivityResults.searchApiStatus === 'success' && (
                        <p className="text-sm text-green-600">✅ Search API key is valid and working</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4" />
                        <CardTitle className="text-lg">Admin API Key</CardTitle>
                        <StatusIcon status={connectivityResults.adminApiStatus} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {connectivityResults.adminApiStatus === 'error' && connectivityResults.adminApiError && (
                        <Alert variant="destructive">
                          <AlertDescription data-testid="text-admin-api-error">
                            {connectivityResults.adminApiError}
                          </AlertDescription>
                        </Alert>
                      )}
                      {connectivityResults.adminApiStatus === 'success' && (
                        <p className="text-sm text-green-600">✅ Admin API key is valid and working</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="functionality" className="space-y-4">
                <div className="space-y-3">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        <CardTitle className="text-lg">Index Access</CardTitle>
                        <StatusIcon status={connectivityResults.indexStatus} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {connectivityResults.indexStatus === 'error' && connectivityResults.indexError && (
                        <Alert variant="destructive">
                          <AlertDescription data-testid="text-index-error">
                            {connectivityResults.indexError}
                          </AlertDescription>
                        </Alert>
                      )}
                      {connectivityResults.indexStatus === 'success' && (
                        <p className="text-sm text-green-600">✅ Can access products index successfully</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        <CardTitle className="text-lg">Search Functionality</CardTitle>
                        <StatusIcon status={connectivityResults.testSearchStatus} />
                      </div>
                    </CardHeader>
                    <CardContent>
                      {connectivityResults.testSearchStatus === 'error' && connectivityResults.testSearchError && (
                        <Alert variant="destructive">
                          <AlertDescription data-testid="text-search-error">
                            {connectivityResults.testSearchError}
                          </AlertDescription>
                        </Alert>
                      )}
                      {connectivityResults.testSearchStatus === 'success' && (
                        <p className="text-sm text-green-600">✅ Search functionality working normally</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}