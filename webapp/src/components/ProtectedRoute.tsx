import { Navigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "ADMIN" | "TENANT";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session?.user) {
    return <Navigate to="/login" replace />;
  }

  // Check role if required
  if (requiredRole && session.user.role !== requiredRole) {
    // Redirect to appropriate portal
    if (session.user.role === "ADMIN") {
      return <Navigate to="/admin" replace />;
    } else {
      return <Navigate to="/portal" replace />;
    }
  }

  return <>{children}</>;
}
