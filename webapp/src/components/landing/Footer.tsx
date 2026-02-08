import { Link } from "react-router-dom";
import { PROPERTY, COMPANY, IMAGES } from "@/lib/constants";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-foreground text-background py-16">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-12 mb-12">
          {/* Brand */}
          <div>
            <img
              src={IMAGES.logo}
              alt={COMPANY.name}
              className="h-32 md:h-40 w-auto brightness-0 invert mb-6"
            />
            <p className="text-background/70 text-sm leading-relaxed">
              Quality rental properties in Ottawa. We're committed to providing
              comfortable, modern living spaces for our residents.
            </p>
          </div>

          {/* Property */}
          <div>
            <h4 className="font-serif text-lg font-medium mb-4">
              {PROPERTY.name}
            </h4>
            <address className="text-background/70 text-sm not-italic leading-relaxed">
              <p>{PROPERTY.address}</p>
              <p>
                {PROPERTY.city}, {PROPERTY.province}
              </p>
              <p>{PROPERTY.postalCode}</p>
            </address>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-serif text-lg font-medium mb-4">Quick Links</h4>
            <nav className="space-y-2 text-sm">
              <a
                href="#overview"
                className="block text-background/70 hover:text-background transition-colors"
              >
                About the Property
              </a>
              <a
                href="#contact"
                className="block text-background/70 hover:text-background transition-colors"
              >
                Request a Showing
              </a>
              <Link
                to="/login"
                className="block text-background/70 hover:text-background transition-colors"
              >
                Tenant Portal
              </Link>
              <Link
                to="/privacy"
                className="block text-background/70 hover:text-background transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="block text-background/70 hover:text-background transition-colors"
              >
                Terms of Service
              </Link>
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-background/20 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-background/50 text-sm">
            &copy; {currentYear} {COMPANY.name}. All rights reserved.
          </p>
          <a
            href={`mailto:${COMPANY.email}`}
            className="text-background/70 hover:text-background text-sm transition-colors"
          >
            {COMPANY.email}
          </a>
        </div>
      </div>
    </footer>
  );
}
