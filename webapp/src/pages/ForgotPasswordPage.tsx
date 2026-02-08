import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { COMPANY, PROPERTY, IMAGES } from "@/lib/constants";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (result.error) {
        // Don't reveal if email exists or not for security
        // Always show success message
        console.error("[FORGOT_PASSWORD] Error:", result.error);
      }

      // Always show success to prevent email enumeration
      setIsSuccess(true);
    } catch (err: unknown) {
      console.error("[FORGOT_PASSWORD] Exception:", err);
      // Still show success to prevent email enumeration
      setIsSuccess(true);
    } finally {
      setIsLoading(false);
    }
  };

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
                  Check Your Email
                </h2>
                <p className="text-muted-foreground">
                  If an account exists for <strong>{email}</strong>, we've sent a password reset link.
                </p>
              </div>

              <div className="bg-secondary/50 rounded-lg p-4 mb-6">
                <p className="text-sm text-muted-foreground">
                  The link will expire in 1 hour. Check your spam folder if you don't see the email.
                </p>
              </div>

              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Return to Login
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
                Forgot Password?
              </h2>
              <p className="text-muted-foreground">
                Enter your email and we'll send you a link to reset your password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
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
                disabled={isLoading || !email}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </form>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Remember your password?{" "}
              <Link to="/login" className="text-accent hover:underline">
                Sign in
              </Link>
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
