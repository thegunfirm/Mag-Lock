import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, InsertUser } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useCart } from "./use-cart";

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: InsertUser) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isLoggedIn: boolean;
  roles: string[];
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const { mergeGuestCart, clearOnLogout } = useCart();

  useEffect(() => {
    // Check if user is already logged in
    const initAuth = async () => {
      try {
        // Check for auto-login after email verification
        const urlParams = new URLSearchParams(window.location.search);
        const isLoggedIn = urlParams.get('loggedIn') === 'true';
        
        if (isLoggedIn) {
          // User was auto-logged in via email verification, fetch current user data
          try {
            const response = await fetch("/api/me", {
              credentials: "include",
              headers: {
                "Content-Type": "application/json"
              }
            });
            
            if (response.status === 401) {
              // Not actually logged in
              console.info("Auto-login check failed: User not authenticated");
              setUser(null);
              setIsLoggedIn(false);
              setRoles([]);
              localStorage.removeItem("user");
              // Clean up URL parameters
              window.history.replaceState({}, '', window.location.pathname);
              return;
            }
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const userData = await response.json();
            setUser(userData);
            setIsLoggedIn(true);
            setRoles(userData.roles || []);
            localStorage.setItem("user", JSON.stringify(userData));
            await mergeGuestCart(userData);
            
            // Clean up URL parameters
            window.history.replaceState({}, '', window.location.pathname);
            return;
          } catch (error) {
            console.error("Error fetching user after auto-login:", error);
            setUser(null);
            setIsLoggedIn(false);
            setRoles([]);
            localStorage.removeItem("user");
          }
        }
        
        // Regular auth check - verify server session first
        try {
          const response = await fetch("/api/me", {
            credentials: "include",
            headers: {
              "Content-Type": "application/json"
            }
          });
          
          if (response.status === 401) {
            // 401 means not authenticated - this is normal for guest users
            console.info("Guest mode: User not authenticated");
            setUser(null);
            setIsLoggedIn(false);
            setRoles([]);
            localStorage.removeItem("user");
            return;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const userData = await response.json();
          setUser(userData);
          setIsLoggedIn(true);
          setRoles(userData.roles || []);
          localStorage.setItem("user", JSON.stringify(userData));
          await mergeGuestCart(userData);
          return;
        } catch (error) {
          // Unexpected error (not 401)
          console.error("Error checking authentication:", error);
          setUser(null);
          setIsLoggedIn(false);
          setRoles([]);
          localStorage.removeItem("user");
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [mergeGuestCart]);

  const login = async (email: string, password: string) => {
    try {
      const response = await apiRequest("POST", "/api/auth/login", { email, password });
      const userData = await response.json();
      
      setUser(userData);
      setIsLoggedIn(true);
      setRoles(userData.roles || []);
      localStorage.setItem("user", JSON.stringify(userData));
      
      // Merge guest cart after successful login
      await mergeGuestCart(userData);
      
      // Return user data for use in login page
      return userData;
    } catch (error: any) {
      // The error is already processed by throwIfResNotOk with natural language message
      // Just re-throw it as it contains the metadata we need
      throw error;
    }
  };

  const register = async (userData: InsertUser) => {
    try {
      const response = await apiRequest("POST", "/api/auth/register", userData);
      const newUser = await response.json();
      
      // Return the response directly so the component can handle different scenarios
      // The response may include: success, message, accountExists, redirectToLogin, needsVerification
      return newUser;
    } catch (error: any) {
      // If it's a network or other error, throw it
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setIsLoggedIn(false);
    setRoles([]);
    localStorage.removeItem("user");
    clearOnLogout(); // Clear cart on logout for security
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading, isLoggedIn, roles }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
