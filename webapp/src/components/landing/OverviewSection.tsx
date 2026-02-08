import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { OVERVIEW } from "@/lib/constants";

export function OverviewSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="overview" className="py-24 md:py-32 bg-background">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center" ref={ref}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <p className="text-sm uppercase tracking-[0.2em] text-accent mb-4">
              About the Property
            </p>
            <h2 className="text-4xl md:text-5xl font-serif font-medium mb-6 text-balance">
              {OVERVIEW.title}
            </h2>
            <div className="section-divider mb-10" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="prose prose-lg max-w-none text-muted-foreground leading-relaxed"
          >
            {OVERVIEW.content.split("\n\n").map((paragraph, index) => (
              <p key={index} className="mb-6 last:mb-0">
                {paragraph}
              </p>
            ))}
          </motion.div>

          {/* Feature highlights */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-16"
          >
            {[
              { value: "2021", label: "Built" },
              { value: "8", label: "Units" },
              { value: "2-4", label: "Bedrooms" },
              { value: "24/7", label: "Support" },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-3xl md:text-4xl font-serif text-primary mb-1">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
