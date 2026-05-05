import {
  AuthKitProvider as WorkOSAuthKitProvider,
  useAuth as useWorkOSAuth,
  useAccessToken,
} from "@workos/authkit-tanstack-react-start/client";
import type { ReactNode } from "react";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
};

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => Promise<void>;
  getAccessToken: (() => Promise<string>) | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return <WorkOSAuthKitProvider>{children}</WorkOSAuthKitProvider>;
}

export function useAuth(): AuthContextValue {
  const auth = useWorkOSAuth();
  const token = useAccessToken();

  const user: AuthUser | null = auth.user
    ? {
        id: auth.user.id,
        email: auth.user.email,
        firstName: auth.user.firstName,
        lastName: auth.user.lastName,
        profilePictureUrl: auth.user.profilePictureUrl,
      }
    : null;

  return {
    user,
    isLoading: auth.loading,
    signIn: () => {
      const returnPathname =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : "/";
      window.location.href = `/api/auth/sign-in?returnPathname=${encodeURIComponent(returnPathname)}`;
    },
    signOut: () => auth.signOut(),
    getAccessToken: auth.user
      ? async () => {
          const t = await token.getAccessToken();
          if (!t) throw new Error("No access token available");
          return t;
        }
      : null,
  };
}
