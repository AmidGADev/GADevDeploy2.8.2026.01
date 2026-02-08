import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { COMPANY, PROPERTY } from "@/lib/constants";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Back to home
        </Link>

        <h1 className="text-4xl font-serif font-medium mb-8">Privacy Policy</h1>

        <div className="prose prose-neutral max-w-none">
          <p className="text-muted-foreground mb-6">
            Last updated: January 2024
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            1. Information We Collect
          </h2>
          <p className="text-muted-foreground mb-4">
            {COMPANY.name} collects information you provide directly to us when
            you request a showing, apply for tenancy, or use our tenant portal.
            This includes your name, email address, phone number, and payment
            information.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            2. How We Use Your Information
          </h2>
          <p className="text-muted-foreground mb-4">
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-6 text-muted-foreground mb-4 space-y-2">
            <li>Process rental applications and manage tenancies</li>
            <li>Communicate with you about your tenancy</li>
            <li>Process rent payments</li>
            <li>Respond to service requests and maintenance issues</li>
            <li>Send important announcements and updates</li>
          </ul>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            3. Information Sharing
          </h2>
          <p className="text-muted-foreground mb-4">
            We do not sell or rent your personal information to third parties.
            We may share your information with service providers who assist us
            in operating our business, such as payment processors.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            4. Data Security
          </h2>
          <p className="text-muted-foreground mb-4">
            We implement appropriate security measures to protect your personal
            information against unauthorized access, alteration, disclosure, or
            destruction.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            5. Contact Us
          </h2>
          <p className="text-muted-foreground mb-4">
            If you have questions about this Privacy Policy, please contact us
            at{" "}
            <a
              href={`mailto:${COMPANY.email}`}
              className="text-accent hover:underline"
            >
              {COMPANY.email}
            </a>
            .
          </p>

          <div className="mt-12 pt-8 border-t">
            <p className="text-sm text-muted-foreground">
              {COMPANY.name}
              <br />
              {PROPERTY.fullAddress}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
