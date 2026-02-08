import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft, Lock, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { COMPANY, PROPERTY, IMAGES } from "@/lib/constants";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isTokenError, setIsTokenError] = useState(false);

  const token = searchParams.get("token");
  const tokenError = searchParams.get("error");

  useEffect(() => {
    if (tokenError === "INVALID_TOKEN") {
      setIsTokenError(true);
    }
  }, [tokenError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    if (!token) {
      setError("Invalid reset token");
      setIsLoading(false);
      return;
    }

    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (result.error) {
        console.error("[RESET_PASSWORD] Error:", result.error);
        if (result.error.message?.includes("INVALID_TOKEN") || result.error.code === "INVALID_TOKEN") {
          setIsTokenError(true);
        } else {
          setError(result.error.message || "Failed to reset password");
        }
        return;
      }

      setIsSuccess(true);
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err: unknown) {
      console.error("[RESET_PASSWORD] Exception:", err);
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (isTokenError) {
    return (
      <div className="min-h-screen flex">
        {/* Left side - Image */}
        <div className="hidden lg:flex lg:w-1/2 relative">
          <img
            src={IMAGES.heroExterior}
            alt="Carsons Terrace"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-primary/80" />
          <div className="absolute inset-0 flex flex-col justify-center items-center text-white p-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <img
                src={IMAGES.logo}
                alt={COMPANY.name}
                className="h-36 w-auto brightness-0 invert mx-auto mb-6"
              />
              <h1 className="text-4xl font-serif font-medium mb-4">
                {PROPERTY.name}
              </h1>
              <p className="text-white/80 mb-2">{PROPERTY.fullAddress}</p>
            </motion.div>
          </div>
        </div>

        {/* Right side - Error message */}
        <div className="w-full lg:w-1/2 flex flex-col">
          <div className="p-6">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} />
              Back to login
            </Link>
          </div>

          <div className="flex-1 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-md text-center"
            >
              <div className="mb-6">
                <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
                <h2 className="text-3xl font-serif font-medium mb-2">
                  Link Expired
                </h2>
                <p className="text-muted-foreground">
                  This password reset link has expired or is invalid.
                </p>
              </div>

              <div className="bg-secondary/50 rounded-lg p-4 mb-6">
                <p className="text-sm text-muted-foreground">
                  Password reset links expire after 1 hour for security reasons. Please request a new link.
                </p>
              </div>

              <Link to="/forgot-password">
                <Button className="w-full bg-primary hover:bg-primary/90">
                  Request New Link
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex">
        {/* Left side - Image */}
        <div className="hidden lg:flex lg:w-1/2 relative">
          <img
            src={IMAGES.heroExterior}
            alt="Carsons Terrace"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-primary/80" />
          <div className="absolute inset-0 flex flex-col justify-center items-center text-white p-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <img
                src={IMAGES.logo}
                alt={COMPANY.name}
                className="h-36 w-auto brightness-0 invert mx-auto mb-6"
              />
              <h1 className="text-4xl font-serif font-medium mb-4">
                {PROPERTY.name}
              </h1>
              <p className="text-white/80 mb-2">{PROPERTY.fullAddress}</p>
            </motion.div>
          </div>
        </div>

        {/* Right side - Success message */}
        <div className="w-full lg:w-1/2 flex flex-col">
          <div className="p-6">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={16} />
              Back to login
            </Link>
          </div>

          <div className="flex-1 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-md text-center"
            >
              <div className="mb-6">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-3xl font-serif font-medium mb-2">
                  Password Reset!
                </h2>
                <p className="text-muted-foreground">
                  Your password has been successfully reset.
                </p>
              </div>

              <div className="bg-secondary/50 rounded-lg p-4 mb-6">
                <p className="text-sm text-muted-foreground">
                  You will be redirected to the login page automatically...
                </p>
              </div>

              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Go to Login
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img
          src={IMAGES.heroExterior}
          alt="Carsons Terrace"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/80" />
        <div className="absolute inset-0 flex flex-col justify-center items-center text-white p-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <img
              src={IMAGES.logo}
              alt={COMPANY.name}
              className="h-36 w-auto brightness-0 invert mx-auto mb-6"
            />
            <h1 className="text-4xl font-serif font-medium mb-4">
              {PROPERTY.name}
            </h1>
            <p className="text-white/80 mb-2">{PROPERTY.fullAddress}</p>
          </motion.div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        <div className="p-6">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Back to login
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl font-serif font-medium mb-2">
                Reset Password
              </h2>
              <p className="text-muted-foreground">
                Enter your new password below.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="new-password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    minLength={8}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirm-password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    minLength={8}
                    className="pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-destructive text-sm text-center"
                >
                  {error}
                </motion.p>
              )}

              <Button
                type="submit"
                disabled={isLoading || !password || !confirmPassword}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Password must be at least 8 characters long.
            </p>
          </motion.div>
        </div>

        {/* Mobile property info */}
        <div className="lg:hidden p-6 bg-secondary/50 text-center">
          <p className="font-serif text-lg">{PROPERTY.name}</p>
          <p className="text-sm text-muted-foreground">{PROPERTY.fullAddress}</p>
        </div>
      </div>
    </div>
  );
}
