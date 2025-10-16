import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

interface StateComplianceAlertProps {
  state: string;
  type?: 'error' | 'warning' | 'info';
  title?: string;
  message?: string;
  blockedCategories?: string[];
  magazineLimit?: number;
}

const STATE_DETAILS = {
  CA: {
    name: 'California',
    severity: 'error',
    title: 'California Shipping Restrictions',
    message: 'We cannot ship firearms or ammunition to California at this time.',
    icon: XCircle,
    categories: ['Firearms', 'Ammunition', 'Magazines']
  },
  MA: {
    name: 'Massachusetts', 
    severity: 'warning',
    title: 'Massachusetts Compliance Requirements',
    message: 'Massachusetts has a 10-round magazine capacity limit and restrictions on certain firearms.',
    icon: AlertTriangle,
    magazineLimit: 10
  },
  NY: {
    name: 'New York',
    severity: 'warning', 
    title: 'New York SAFE Act Requirements',
    message: 'New York SAFE Act limits magazine capacity to 10 rounds.',
    icon: AlertTriangle,
    magazineLimit: 10
  },
  NJ: {
    name: 'New Jersey',
    severity: 'warning',
    title: 'New Jersey Compliance',
    message: 'New Jersey limits magazine capacity to 10 rounds.',
    icon: AlertTriangle,
    magazineLimit: 10
  },
  CT: {
    name: 'Connecticut',
    severity: 'warning',
    title: 'Connecticut Compliance', 
    message: 'Connecticut limits magazine capacity to 10 rounds.',
    icon: AlertTriangle,
    magazineLimit: 10
  }
};

export function StateComplianceAlert({ state, type, title, message, blockedCategories, magazineLimit }: StateComplianceAlertProps) {
  // Use predefined state details if available
  const stateDetails = STATE_DETAILS[state as keyof typeof STATE_DETAILS];
  
  // Determine severity and styling
  const severity = type || stateDetails?.severity || 'info';
  const Icon = stateDetails?.icon || (severity === 'error' ? XCircle : severity === 'warning' ? AlertTriangle : Info);
  
  const alertVariant = severity === 'error' ? 'destructive' : 'default';
  const borderColor = severity === 'error' ? 'border-red-500' : severity === 'warning' ? 'border-yellow-500' : 'border-blue-500';
  const bgColor = severity === 'error' ? 'bg-red-50' : severity === 'warning' ? 'bg-yellow-50' : 'bg-blue-50';
  
  // Use provided or default values
  const alertTitle = title || stateDetails?.title || `${state} Shipping Information`;
  const alertMessage = message || stateDetails?.message || 'This state has specific shipping requirements.';
  const categories = blockedCategories || stateDetails?.categories || [];
  const magLimit = magazineLimit || stateDetails?.magazineLimit;

  return (
    <Alert className={`${borderColor} ${bgColor} mb-4`} variant={alertVariant}>
      <Icon className="h-4 w-4" />
      <AlertTitle className="font-semibold">{alertTitle}</AlertTitle>
      <AlertDescription className="mt-2 space-y-2">
        <p>{alertMessage}</p>
        
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            <span className="text-sm font-medium mr-2">Blocked Items:</span>
            {categories.map((category) => (
              <Badge key={category} variant="destructive" className="text-xs">
                {category}
              </Badge>
            ))}
          </div>
        )}
        
        {magLimit && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              Magazine Limit: {magLimit} rounds
            </Badge>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Hook to check if a state has restrictions
 */
export function useStateCompliance(state: string) {
  const hasRestrictions = STATE_DETAILS.hasOwnProperty(state);
  const details = STATE_DETAILS[state as keyof typeof STATE_DETAILS];
  
  return {
    hasRestrictions,
    isBlocked: details?.severity === 'error',
    magazineLimit: details?.magazineLimit,
    details
  };
}