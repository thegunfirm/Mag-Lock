import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error boundary caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    
    if (hasError && prevProps.resetKeys !== resetKeys) {
      if (resetOnPropsChange) {
        this.setState({ hasError: false, error: undefined });
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg border border-gray-200">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Something went wrong
          </h3>
          <p className="text-sm text-gray-600 mb-4 text-center max-w-md">
            We encountered an error loading this section. Please try refreshing the page or contact support if the problem persists.
          </p>
          <Button 
            onClick={this.handleReset}
            variant="outline"
            size="sm"
          >
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrapper for specific sections
export function SectionErrorBoundary({ 
  children, 
  sectionName = 'section' 
}: { 
  children: ReactNode;
  sectionName?: string;
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="py-8 text-center text-gray-500">
          <p>Unable to load {sectionName}. Please refresh the page to try again.</p>
        </div>
      }
      onError={(error) => {
        console.warn(`Error in ${sectionName}:`, error.message);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}