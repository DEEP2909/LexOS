"use client";

import { useAuthStore } from "@/lib/auth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: string[];
  fallbackPath?: string;
}

/**
 * AuthGuard - Protects routes from unauthorized access
 * 
 * Usage:
 * <AuthGuard requiredRoles={["admin"]}>
 *   <AdminContent />
 * </AuthGuard>
 */
export function AuthGuard({ 
  children, 
  requiredRoles = [], 
  fallbackPath = "/login" 
}: AuthGuardProps) {
  const { isAuthenticated, user, isLoading, checkAuth } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check auth state on mount
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      // Store the attempted URL for redirect after login
      const returnUrl = encodeURIComponent(pathname);
      router.push(`${fallbackPath}?returnUrl=${returnUrl}`);
      return;
    }

    // Check role requirements
    if (requiredRoles.length > 0 && user) {
      const hasRequiredRole = requiredRoles.some(role => 
        role === user.role
      );
      
      if (!hasRequiredRole) {
        router.push("/dashboard");
      }
    }
  }, [isAuthenticated, isLoading, user, requiredRoles, router, pathname, fallbackPath]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render children until authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Check roles if required
  if (requiredRoles.length > 0 && user) {
    const hasRequiredRole = requiredRoles.some(role => 
      role === user.role
    );
    
    if (!hasRequiredRole) {
      return null;
    }
  }

  return <>{children}</>;
}

/**
 * withAuth HOC - Alternative to AuthGuard for wrapping entire pages
 */
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: { requiredRoles?: string[]; fallbackPath?: string }
) {
  return function WithAuthComponent(props: P) {
    return (
      <AuthGuard 
        requiredRoles={options?.requiredRoles} 
        fallbackPath={options?.fallbackPath}
      >
        <WrappedComponent {...props} />
      </AuthGuard>
    );
  };
}
