import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { Send, Loader2, CheckCircle, MapPin, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PROPERTY, COMPANY } from "@/lib/constants";
import { api } from "@/lib/api";

export function ContactSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await api.post("/api/property/showing-request", formData);
      setIsSubmitted(true);
      setFormData({ name: "", email: "", phone: "", message: "" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className="py-24 md:py-32 bg-secondary/30">
      <div className="container mx-auto px-6" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-sm uppercase tracking-[0.2em] text-accent mb-4">
            Get in Touch
          </p>
          <h2 className="text-4xl md:text-5xl font-serif font-medium mb-6">
            Request a Showing
          </h2>
          <div className="section-divider mb-6" />
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Interested in making Carsons Terrace your new home? Fill out the form
            below and we'll be in touch to schedule a viewing.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-16 max-w-6xl mx-auto">
          {/* Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {isSubmitted ? (
              <div className="bg-card rounded-lg p-8 text-center">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
                <h3 className="text-xl font-serif font-medium mb-2">
                  Thank You!
                </h3>
                <p className="text-muted-foreground mb-4">
                  We've received your request and will be in touch shortly to
                  schedule your showing.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setIsSubmitted(false)}
                >
                  Submit Another Request
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      placeholder="Your name"
                      className="bg-card"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder="your@email.com"
                      className="bg-card"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(613) 555-0123"
                    className="bg-card"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message (optional)</Label>
                  <Textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us about yourself and your ideal move-in date..."
                    rows={4}
                    className="bg-card resize-none"
                  />
                </div>

                {error && (
                  <p className="text-destructive text-sm">{error}</p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full bg-accent hover:bg-accent/90 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={18} className="mr-2" />
                      Request a Showing
                    </>
                  )}
                </Button>
              </form>
            )}
          </motion.div>

          {/* Contact Info */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="space-y-8"
          >
            <div>
              <h3 className="font-serif text-xl font-medium mb-4">
                Property Address
              </h3>
              <div className="flex items-start gap-3 text-muted-foreground">
                <MapPin size={20} className="mt-0.5 flex-shrink-0 text-accent" />
                <div>
                  <p>{PROPERTY.address}</p>
                  <p>
                    {PROPERTY.city}, {PROPERTY.province} {PROPERTY.postalCode}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-serif text-xl font-medium mb-4">
                Contact Information
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Mail size={20} className="flex-shrink-0 text-accent" />
                  <a
                    href={`mailto:${COMPANY.email}`}
                    className="hover:text-accent transition-colors"
                  >
                    {COMPANY.email}
                  </a>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Phone size={20} className="flex-shrink-0 text-accent" />
                  <span>{PROPERTY.phone}</span>
                </div>
              </div>
            </div>

            {/* Map placeholder */}
            <div className="aspect-video rounded-lg overflow-hidden bg-muted">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2804.8361857820397!2d-75.56879842357091!3d45.43974397107392!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x4cce0f08b7c4e3b7%3A0x5c4d40c8a5c1c8c8!2s709%20Carsons%20Rd%2C%20Ottawa%2C%20ON%20K1K%202H2!5e0!3m2!1sen!2sca!4v1704067200000!5m2!1sen!2sca"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Property Location"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
