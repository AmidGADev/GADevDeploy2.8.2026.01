import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const authClient = createAuthClient({
  baseURL: backendUrl,
  plugins: [adminClient()],
  fetchOptions: {
    credentials: "include",
  },
});

export const { useSession, signOut } = authClient;

// Helper to check if user is admin
export function useIsAdmin() {
  const { data: session } = useSession();
  return session?.user?.role === "ADMIN";
}

// Helper to check if user is tenant
export function useIsTenant() {
  const { data: session } = useSession();
  return session?.user?.role === "TENANT";
}
