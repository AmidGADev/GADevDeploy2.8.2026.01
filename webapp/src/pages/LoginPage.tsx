import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { COMPANY, PROPERTY, IMAGES } from "@/lib/constants";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      console.log("[LOGIN] Attempting login for:", email.trim());
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      console.log("[LOGIN] Result:", result);

      if (result.error) {
        console.error("[LOGIN] Error:", result.error);
        // Handle deactivated account specifically
        if (result.error.message?.includes("deactivated") || result.error.code === "ACCOUNT_DEACTIVATED") {
          setError("Account is deactivated. Contact admin.");
        } else {
          setError(result.error.message || "Invalid email or password");
        }
        return;
      }

      // Redirect based on role
      const session = await authClient.getSession();
      console.log("[LOGIN] Session:", session);
      if (session.data?.user?.role === "ADMIN") {
        navigate("/admin");
      } else {
        navigate("/portal");
      }
    } catch (err: unknown) {
      console.error("[LOGIN] Exception:", err);
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      // Check if it's a network/CORS error
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        setError("Connection error. Please check your internet connection.");
      } else {
        setError(errorMessage || "An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

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

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 flex flex-col">
        {/* Back button */}
        <div className="p-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={16} />
            Back to home
          </Link>
        </div>

        {/* Form container */}
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md"
          >
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-serif font-medium mb-2">
                Tenant Portal
              </h2>
              <p className="text-muted-foreground">
                Sign in to access your account
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-accent hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
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
                disabled={isLoading || !email || !password}
                className="w-full bg-primary hover:bg-primary/90 touch-manipulation"
                onClick={(e) => {
                  // Ensure we don't double-submit on mobile
                  if (isLoading) {
                    e.preventDefault();
                  }
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            {/* Help text */}
            <p className="mt-8 text-center text-sm text-muted-foreground">
              This portal is for registered tenants only.
              <br />
              Contact{" "}
              <a
                href={`mailto:${COMPANY.email}`}
                className="text-accent hover:underline"
              >
                {COMPANY.email}
              </a>{" "}
              for access.
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
