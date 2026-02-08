import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import {
  Car,
  Zap,
  Home,
  FileText,
  Wrench,
  MapPin,
} from "lucide-react";
import { AMENITIES } from "@/lib/constants";

const AMENITY_CATEGORIES = [
  { key: "parking", icon: Car, title: "Parking" },
  { key: "utilities", icon: Zap, title: "Utilities" },
  { key: "inclusions", icon: Home, title: "Inclusions" },
  { key: "policies", icon: FileText, title: "Policies" },
  { key: "maintenance", icon: Wrench, title: "Maintenance" },
  { key: "location", icon: MapPin, title: "Location" },
] as const;

export function AmenitiesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="amenities" className="py-24 md:py-32 bg-background">
      <div className="container mx-auto px-6" ref={ref}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-sm uppercase tracking-[0.2em] text-accent mb-4">
            What's Included
          </p>
          <h2 className="text-4xl md:text-5xl font-serif font-medium mb-6">
            Amenities & Features
          </h2>
          <div className="section-divider mb-6" />
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every detail has been considered to provide you with a comfortable
            and convenient living experience.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {AMENITY_CATEGORIES.map((category, index) => {
            const Icon = category.icon;
            const items = AMENITIES[category.key];
            return (
              <motion.div
                key={category.key}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-card rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Icon size={20} className="text-primary" />
                  </div>
                  <h3 className="font-serif text-lg font-medium">
                    {category.title}
                  </h3>
                </div>
                <ul className="space-y-2">
                  {items.map((item, itemIndex) => (
                    <li
                      key={itemIndex}
                      className="text-sm text-muted-foreground flex items-start gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
