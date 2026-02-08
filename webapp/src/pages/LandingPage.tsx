import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { OverviewSection } from "@/components/landing/OverviewSection";
import { UnitsSection } from "@/components/landing/UnitsSection";
import { AmenitiesSection } from "@/components/landing/AmenitiesSection";
import { NeighborhoodSection } from "@/components/landing/NeighborhoodSection";
import { GallerySection } from "@/components/landing/GallerySection";
import { FAQSection } from "@/components/landing/FAQSection";
import { ContactSection } from "@/components/landing/ContactSection";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen scroll-smooth">
      <Header />
      <main>
        <HeroSection />
        <OverviewSection />
        <UnitsSection />
        <AmenitiesSection />
        <NeighborhoodSection />
        <GallerySection />
        <FAQSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
}
