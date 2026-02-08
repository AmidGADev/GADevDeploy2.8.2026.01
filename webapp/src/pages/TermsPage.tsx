import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { COMPANY, PROPERTY } from "@/lib/constants";

export default function TermsPage() {
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

        <h1 className="text-4xl font-serif font-medium mb-8">Terms of Service</h1>

        <div className="prose prose-neutral max-w-none">
          <p className="text-muted-foreground mb-6">
            Last updated: January 2024
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            1. Acceptance of Terms
          </h2>
          <p className="text-muted-foreground mb-4">
            By accessing or using the {COMPANY.name} tenant portal and services,
            you agree to be bound by these Terms of Service.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            2. Tenant Portal
          </h2>
          <p className="text-muted-foreground mb-4">
            The tenant portal is provided for current tenants of {PROPERTY.name}{" "}
            to manage their tenancy, pay rent, submit service requests, and
            receive communications.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            3. Account Security
          </h2>
          <p className="text-muted-foreground mb-4">
            You are responsible for maintaining the confidentiality of your
            account credentials. You must notify us immediately of any
            unauthorized use of your account.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            4. Rent Payments
          </h2>
          <p className="text-muted-foreground mb-4">
            Rent payments made through the portal are processed by Stripe, a
            third-party payment processor. By making payments, you agree to
            Stripe's terms of service.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            5. Service Requests
          </h2>
          <p className="text-muted-foreground mb-4">
            Service requests submitted through the portal will be addressed in
            accordance with the terms of your lease agreement. Emergency
            maintenance issues should be reported by phone.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            6. Limitation of Liability
          </h2>
          <p className="text-muted-foreground mb-4">
            {COMPANY.name} shall not be liable for any indirect, incidental,
            special, or consequential damages arising from your use of our
            services.
          </p>

          <h2 className="text-xl font-serif font-medium mt-8 mb-4">
            7. Contact
          </h2>
          <p className="text-muted-foreground mb-4">
            For questions about these Terms, please contact us at{" "}
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
