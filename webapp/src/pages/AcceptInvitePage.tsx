import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { COMPANY } from "@/lib/constants";
import { Building2, Check, AlertCircle, Loader2, Eye, EyeOff, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RoleInUnit } from "../../../backend/src/types";

interface InvitationDetails {
  email: string;
  tenantName: string | null;
  unitLabel: string | null;
  buildingName: string | null;
  role: string;
  roleInUnit: RoleInUnit;
  expiresAt: string;
}

interface AcceptInvitationResponse {
  success: boolean;
  message: string;
}

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Fetch invitation details
  const {
    data: invitation,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api.get<InvitationDetails>(`/api/invitations/${token}`),
    enabled: !!token,
    retry: false,
  });

  // Pre-fill name from invitation
  useEffect(() => {
    if (invitation?.tenantName) {
      setName(invitation.tenantName);
    }
  }, [invitation]);

  // Accept invitation mutation
  const acceptMutation = useMutation({
    mutationFn: (data: { name: string; password: string }) =>
      api.post<AcceptInvitationResponse>(`/api/invitations/${token}/accept`, data),
    onSuccess: () => {
      // Redirect to login after successful acceptance
      setTimeout(() => {
        navigate("/login?welcome=1");
      }, 2000);
    },
  });

  const validatePassword = () => {
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return false;
    }
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword()) return;
    acceptMutation.mutate({ name, password });
  };

  // No token provided
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>
              This invitation link is missing the required token. Please check
              your email and try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link to="/">
              <Button variant="outline">Return to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Verifying invitation...</p>
        </div>
      </div>
    );
  }

  // Error state (invalid, expired, or already accepted)
  if (error || !invitation) {
    const errorMessage =
      (error as { message?: string })?.message ||
      "This invitation link is invalid or has expired.";

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invitation Error</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              If you believe this is an error, please contact your property
              manager.
            </p>
            <Link to="/">
              <Button variant="outline">Return to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine role labels and welcome messages
  const isPrimary = invitation.roleInUnit === "PRIMARY";
  const roleLabel = isPrimary ? "Primary Tenant" : "Additional Occupant";
  const welcomeMessage = isPrimary
    ? "Complete your account setup to access the tenant portal"
    : "Complete your account setup to join your household in the tenant portal";

  // Success state - account created
  if (acceptMutation.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Welcome to {COMPANY.name}!</CardTitle>
            <CardDescription>
              {isPrimary
                ? "Your account has been created successfully. You will be redirected to the login page shortly."
                : "Your account has been created successfully. You can now access the tenant portal and coordinate with your household members."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link to="/login">
              <Button>Continue to Login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main form
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            {isPrimary ? (
              <Building2 className="h-6 w-6 text-primary" />
            ) : (
              <Users className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle>Welcome to {COMPANY.name}</CardTitle>
          <CardDescription>{welcomeMessage}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Invitation Details */}
          <div className="mb-6 p-4 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{invitation.email}</span>
            </div>
            {invitation.unitLabel && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unit</span>
                <span className="font-medium">
                  {invitation.buildingName
                    ? `${invitation.buildingName} - ${invitation.unitLabel}`
                    : invitation.unitLabel}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm items-center">
              <span className="text-muted-foreground">Role in Unit</span>
              <Badge variant={isPrimary ? "default" : "secondary"}>
                {roleLabel}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Access</span>
              <span className="font-medium capitalize">
                {invitation.role === "TENANT" ? "Tenant Portal" : "Admin Portal"}
              </span>
            </div>
          </div>

          {/* Info message for occupants */}
          {!isPrimary && (
            <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                As an additional occupant, you will be able to view invoices, submit service requests, and access announcements for your unit.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">Create Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setPasswordError("");
                  }}
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder="Re-enter your password"
                required
                className="mt-1"
              />
            </div>

            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}

            {acceptMutation.isError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">
                  {(acceptMutation.error as { message?: string })?.message ||
                    "Failed to create account. Please try again."}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By creating an account, you agree to our{" "}
            <Link to="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
