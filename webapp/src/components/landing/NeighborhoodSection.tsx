import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import {
  GraduationCap,
  Bus,
  ShoppingBag,
  Building2,
  Stethoscope,
  Trees,
} from "lucide-react";
import { NEIGHBORHOOD } from "@/lib/constants";

const ICON_MAP = {
  GraduationCap,
  Bus,
  ShoppingBag,
  Building2,
  Stethoscope,
  Trees,
};

export function NeighborhoodSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="neighborhood" className="py-24 md:py-32 bg-primary text-primary-foreground">
      <div className="container mx-auto px-6" ref={ref}>
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <p className="text-sm uppercase tracking-[0.2em] text-white/70 mb-4">
              The Neighborhood
            </p>
            <h2 className="text-4xl md:text-5xl font-serif font-medium mb-6">
              {NEIGHBORHOOD.title}
            </h2>
            <div className="w-16 h-[2px] bg-accent mb-8" />
            <div className="prose prose-lg prose-invert max-w-none">
              {NEIGHBORHOOD.content.split("\n\n").map((paragraph, index) => (
                <p key={index} className="mb-4 text-white/80 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </motion.div>

          {/* Highlights Grid */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-3 gap-4"
          >
            {NEIGHBORHOOD.highlights.map((highlight, index) => {
              const Icon = ICON_MAP[highlight.icon as keyof typeof ICON_MAP];
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                  className="bg-white/10 backdrop-blur-sm rounded-lg p-5 text-center hover:bg-white/15 transition-colors"
                >
                  <Icon size={28} className="mx-auto mb-3 text-accent" />
                  <p className="text-sm font-medium text-white/90">
                    {highlight.label}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
