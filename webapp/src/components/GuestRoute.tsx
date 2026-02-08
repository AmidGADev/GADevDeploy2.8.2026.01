import { Navigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";

interface GuestRouteProps {
  children: React.ReactNode;
}

export function GuestRoute({ children }: GuestRouteProps) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (session?.user) {
    // Redirect to appropriate portal based on role
    if (session.user.role === "ADMIN") {
      return <Navigate to="/admin" replace />;
    } else {
      return <Navigate to="/portal" replace />;
    }
  }

  return <>{children}</>;
}
