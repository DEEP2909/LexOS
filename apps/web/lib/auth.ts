/**
 * EvidentIS Auth State Management
 * Zustand store for authentication state
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Attorney } from "@evidentis/shared";
import { auth, setTokens, clearTokens, loadTokens } from "./api";

interface AuthState {
  user: Attorney | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaRequired: boolean;
  mfaSessionToken: string | null;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  verifyMfa: (code: string) => Promise<boolean>;
  checkAuth: () => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      mfaRequired: false,
      mfaSessionToken: null,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await auth.login(email, password);

          // Check if MFA is required
          if (response.mfaRequired && response.mfaSessionToken) {
            set({
              mfaRequired: true,
              mfaSessionToken: response.mfaSessionToken,
              isLoading: false,
            });
            return true;
          }

          // Login successful
          if (response.accessToken && response.refreshToken) {
            setTokens(response.accessToken, response.refreshToken);
            const user = await auth.me();
            set({
              user,
              isAuthenticated: true,
              mfaRequired: false,
              mfaSessionToken: null,
              isLoading: false,
            });
            return true;
          }

          throw new Error("Invalid login response");
        } catch (err) {
          const message = err instanceof Error ? err.message : "Login failed";
          set({ error: message, isLoading: false });
          return false;
        }
      },

      verifyMfa: async (code: string) => {
        const { mfaSessionToken } = get();
        if (!mfaSessionToken) {
          set({ error: "MFA session expired" });
          return false;
        }

        set({ isLoading: true, error: null });
        try {
          await auth.verifyMFA(code);
          const user = await auth.me();
          set({
            user,
            isAuthenticated: true,
            mfaRequired: false,
            mfaSessionToken: null,
            isLoading: false,
          });
          return true;
        } catch (err) {
          const message = err instanceof Error ? err.message : "MFA verification failed";
          set({ error: message, isLoading: false });
          return false;
        }
      },

      logout: async () => {
        try {
          await auth.logout();
        } finally {
          clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            mfaRequired: false,
            mfaSessionToken: null,
            error: null,
          });
        }
      },

      checkAuth: async () => {
        loadTokens();
        set({ isLoading: true });
        try {
          const user = await auth.me();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          clearTokens();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),
    }),
    {
      name: "evidentis-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist user data, not loading states
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

/**
 * Hook to require authentication
 * Redirects to login if not authenticated
 */
export function useRequireAuth() {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  // Check auth on mount
  if (typeof window !== "undefined" && !isAuthenticated && !isLoading) {
    checkAuth();
  }

  return { isAuthenticated, isLoading };
}
