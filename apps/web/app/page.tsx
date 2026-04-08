"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace("/dashboard");
      } else {
        router.replace("/login");
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full navy-gradient flex items-center justify-center">
            <span className="text-2xl font-bold text-white">L</span>
          </div>
          <Loader2 className="absolute -bottom-1 -right-1 h-6 w-6 animate-spin text-[hsl(var(--gold))]" />
        </div>
        <p className="text-muted-foreground">Loading LexOS...</p>
      </div>
    </div>
  );
}
