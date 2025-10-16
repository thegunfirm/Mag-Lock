import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle, XCircle, Loader2, Mail, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type VerificationState = 'verifying' | 'success' | 'error' | 'invalid';

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [verificationState, setVerificationState] = useState<VerificationState>('verifying');
  const [message, setMessage] = useState<string>('');
  const [resendEmail, setResendEmail] = useState<string>('');
  const [resendLoading, setResendLoading] = useState<boolean>(false);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (!token) {
      setVerificationState('invalid');
      setMessage('No verification token provided');
      return;
    }
    
    setCurrentToken(token);
    verifyEmail(token);
  }, []);
  
  // Cooldown timer effect
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);
  
  const verifyEmail = async (token: string) => {
    try {
      const response = await apiRequest('GET', `/api/auth/verify-email?token=${token}`);
      const data = await response.json();
      
      if (data.success) {
        setVerificationState('success');
        setMessage(data.message || 'Email verified successfully!');
      } else {
        setVerificationState('error');
        setMessage(data.message || 'Email verification failed');
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      setVerificationState('error');
      setMessage(error.message || 'Email verification failed. Please try again.');
    }
  };
  
  const handleContinue = () => {
    // After email verification, redirect to tier selection page
    setLocation('/select-tier');
  };
  
  const handleResendVerification = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    
    try {
      setResendLoading(true);
      
      const payload: { token?: string; email?: string } = {};
      
      // Use token if available, otherwise use email input
      if (currentToken) {
        payload.token = currentToken;
      } else if (resendEmail.trim()) {
        payload.email = resendEmail.trim();
      } else {
        toast({
          title: "Email Required",
          description: "Please enter your email address to resend verification.",
          variant: "destructive"
        });
        return;
      }
      
      const response = await apiRequest('POST', '/api/auth/resend-verification', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Verification Email Sent",
          description: data.message || "If an account exists with that email, a verification email has been sent.",
          variant: "default"
        });
        
        // Start 60-second cooldown
        setResendCooldown(60);
      } else {
        toast({
          title: "Request Failed",
          description: data.message || "Failed to resend verification email. Please try again.",
          variant: "destructive"
        });
      }
      
    } catch (error: any) {
      console.error('Resend verification error:', error);
      toast({
        title: "Request Failed",
        description: "Failed to resend verification email. Please check your connection and try again.",
        variant: "destructive"
      });
    } finally {
      setResendLoading(false);
    }
  };
  
  const renderContent = () => {
    switch (verificationState) {
      case 'verifying':
        return (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 mb-4">
              <Loader2 className="h-8 w-8 text-blue-600 dark:text-blue-300 animate-spin" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Verifying Your Email
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400">
              Please wait while we verify your email address...
            </CardDescription>
          </div>
        );
        
      case 'success':
        return (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 mb-4">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-300" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Email Verified!
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400 mb-6">
              Your account is now active and ready to use
            </CardDescription>
            
            <Alert className="mb-6" variant="default">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {message}
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-2">
                  Welcome to The Gun Firm!
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  You can now sign in to access tier-based pricing, secure checkout, and order tracking.
                </p>
              </div>
              
              <Button onClick={handleContinue} className="w-full">
                Sign In to Your Account
              </Button>
            </div>
          </div>
        );
        
      case 'error':
        return (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900 mb-4">
              <XCircle className="h-8 w-8 text-red-600 dark:text-red-300" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Verification Failed
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400 mb-6">
              We couldn't verify your email address
            </CardDescription>
            
            <Alert className="mb-6" variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                {message}
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                  Don't worry - we can help!
                </p>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                  Your verification link may have expired. Click below to get a new verification email.
                </p>
              </div>
              
              {/* Resend Verification Section */}
              <div className="space-y-3">
                {!currentToken && (
                  <div>
                    <label htmlFor="resend-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Email Address
                    </label>
                    <Input
                      id="resend-email"
                      type="email"
                      placeholder="Enter your email address"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      data-testid="input-resend-email"
                    />
                  </div>
                )}
                
                <Button
                  onClick={handleResendVerification}
                  disabled={resendLoading || resendCooldown > 0 || (!currentToken && !resendEmail.trim())}
                  className="w-full"
                  data-testid="button-resend-verification"
                >
                  {resendLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : resendCooldown > 0 ? (
                    `Wait ${resendCooldown}s before resending`
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Resend Verification Email
                    </>
                  )}
                </Button>
              </div>
              
              <div className="flex space-x-3">
                <Button onClick={() => setLocation('/register')} variant="outline" className="flex-1" data-testid="button-register-again">
                  Register Again
                </Button>
                <Button onClick={() => setLocation('/login')} className="flex-1" data-testid="button-back-to-login">
                  Back to Login
                </Button>
              </div>
            </div>
          </div>
        );
        
      case 'invalid':
        return (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
              <Mail className="h-8 w-8 text-gray-600 dark:text-gray-300" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Invalid Link
            </CardTitle>
            <CardDescription className="text-gray-600 dark:text-gray-400 mb-6">
              This verification link is not valid
            </CardDescription>
            
            <Alert className="mb-6" variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                {message}
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                  This verification link is invalid. We can send you a new one!
                </p>
              </div>
              
              {/* Resend Verification Section */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="resend-email-invalid" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email Address
                  </label>
                  <Input
                    id="resend-email-invalid"
                    type="email"
                    placeholder="Enter your email address"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    data-testid="input-resend-email-invalid"
                  />
                </div>
                
                <Button
                  onClick={handleResendVerification}
                  disabled={resendLoading || resendCooldown > 0 || !resendEmail.trim()}
                  className="w-full"
                  data-testid="button-resend-verification-invalid"
                >
                  {resendLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : resendCooldown > 0 ? (
                    `Wait ${resendCooldown}s before resending`
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send New Verification Email
                    </>
                  )}
                </Button>
              </div>
              
              <div className="flex space-x-3">
                <Button onClick={() => setLocation('/register')} variant="outline" className="flex-1" data-testid="button-register">
                  Register
                </Button>
                <Button onClick={() => setLocation('/login')} className="flex-1" data-testid="button-sign-in">
                  Sign In
                </Button>
              </div>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          {renderContent()}
        </CardHeader>
      </Card>
    </div>
  );
}