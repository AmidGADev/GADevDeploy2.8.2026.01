import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NAV_LINKS, IMAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* Navigation bar - fixed at top with consistent height */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-colors duration-300 py-5",
          isScrolled
            ? "bg-white/95 backdrop-blur-md shadow-sm"
            : "bg-transparent"
        )}
      >
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-center h-14">
            {/* Logo - absolutely positioned on the left, doesn't affect centering */}
            <div className="absolute left-6">
              <img
                src={IMAGES.logo}
                alt="GA Developments"
                className={cn(
                  "w-auto max-h-32 md:max-h-36 transition-opacity duration-300 object-contain",
                  isScrolled
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none"
                )}
              />
            </div>

            {/* Desktop Navigation - centered */}
            <nav className="hidden lg:flex items-center gap-10">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-lg font-medium transition-colors hover:text-accent",
                    isScrolled ? "text-muted-foreground" : "text-white/90"
                  )}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* CTA Buttons - absolutely positioned on the right */}
            <div className="hidden lg:flex items-center gap-3 absolute right-6">
              <Link to="/login">
                <Button
                  variant="ghost"
                  className={cn(
                    "font-medium text-base",
                    isScrolled
                      ? "text-foreground hover:text-accent"
                      : "text-white hover:text-white/80 hover:bg-white/10"
                  )}
                >
                  Tenant Login
                </Button>
              </Link>
              <a href="#contact">
                <Button
                  className="bg-accent hover:bg-accent/90 text-white font-medium text-base"
                >
                  Request a Showing
                </Button>
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={cn(
                "lg:hidden p-2 transition-colors absolute right-6",
                isScrolled ? "text-foreground" : "text-white"
              )}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Mobile Menu */}
          {isMobileMenuOpen && (
            <div className="lg:hidden mt-4 pb-4 border-t border-white/20">
              <nav className="flex flex-col gap-2 mt-4">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "py-2 text-base font-medium transition-colors",
                      isScrolled ? "text-foreground" : "text-white"
                    )}
                  >
                    {link.label}
                  </a>
                ))}
                <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-white/20">
                  <Link to="/login" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Tenant Login
                    </Button>
                  </Link>
                  <a href="#contact" onClick={() => setIsMobileMenuOpen(false)}>
                    <Button
                      className="w-full bg-accent hover:bg-accent/90 text-white"
                    >
                      Request a Showing
                    </Button>
                  </a>
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Large hero logo - positioned in hero area */}
      <div className="fixed top-24 left-6 md:left-10 z-40 pointer-events-none">
        <img
          src={IMAGES.logo}
          alt="GA Developments"
          className={cn(
            "w-auto transition-all duration-500 brightness-0 invert",
            isScrolled
              ? "h-0 opacity-0"
              : "h-32 md:h-44 lg:h-56 opacity-100"
          )}
        />
      </div>
    </>
  );
}
