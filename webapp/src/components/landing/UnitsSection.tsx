import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef, useState } from "react";
import { Bed, Bath, Maximize, Check, X, ChevronLeft, ChevronRight, Images } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UNIT_TYPES, UNIT_IMAGES } from "@/lib/constants";

type UnitImageKey = keyof typeof UNIT_IMAGES;

export function UnitsSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [selectedUnit, setSelectedUnit] = useState<UnitImageKey | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const openGallery = (imageKey: UnitImageKey) => {
    setSelectedUnit(imageKey);
    setCurrentImageIndex(0);
  };

  const closeGallery = () => {
    setSelectedUnit(null);
    setCurrentImageIndex(0);
  };

  const nextImage = () => {
    if (selectedUnit) {
      const images = UNIT_IMAGES[selectedUnit];
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }
  };

  const prevImage = () => {
    if (selectedUnit) {
      const images = UNIT_IMAGES[selectedUnit];
      setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    }
  };

  return (
    <>
      <section id="units" className="py-24 md:py-32 bg-secondary/30">
        <div className="container mx-auto px-6" ref={ref}>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <p className="text-sm uppercase tracking-[0.2em] text-accent mb-4">
              Floor Plans
            </p>
            <h2 className="text-4xl md:text-5xl font-serif font-medium mb-6">
              Unit Types
            </h2>
            <div className="section-divider mb-6" />
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose from our thoughtfully designed floor plans, each offering
              modern amenities and comfortable living spaces.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {UNIT_TYPES.map((unit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: index * 0.2 }}
              >
                <Card className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <div
                    className="aspect-[4/3] relative overflow-hidden cursor-pointer group"
                    onClick={() => openGallery(unit.images)}
                  >
                    <img
                      src={unit.thumbnail}
                      alt={unit.name}
                      className="w-full h-full object-cover image-hover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-300 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-2 text-white font-medium">
                        <Images size={20} />
                        <span>View {UNIT_IMAGES[unit.images].length} Photos</span>
                      </div>
                    </div>
                    <div className="absolute top-4 left-4">
                      <span className="bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium rounded">
                        {unit.name}
                      </span>
                    </div>
                  </div>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-6 text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Bed size={18} />
                          <span className="text-sm">{unit.beds} Bed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Bath size={18} />
                          <span className="text-sm">{unit.baths} Bath</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Maximize size={18} />
                          <span className="text-sm">{unit.size}</span>
                        </div>
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {unit.features.map((feature, featureIndex) => (
                        <li
                          key={featureIndex}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <Check size={16} className="text-accent flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Button
                      variant="outline"
                      className="w-full mt-6"
                      onClick={() => openGallery(unit.images)}
                    >
                      <Images size={16} className="mr-2" />
                      View All Photos
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-center text-sm text-muted-foreground mt-10"
          >
            Contact us for current availability and pricing
          </motion.p>
        </div>
      </section>

      {/* Image Gallery Modal */}
      {selectedUnit && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeGallery}
        >
          <button
            onClick={closeGallery}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10"
          >
            <X size={32} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); prevImage(); }}
            className="absolute left-4 text-white/80 hover:text-white p-2 z-10"
          >
            <ChevronLeft size={48} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); nextImage(); }}
            className="absolute right-4 text-white/80 hover:text-white p-2 z-10"
          >
            <ChevronRight size={48} />
          </button>

          <div
            className="max-w-5xl max-h-[85vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={UNIT_IMAGES[selectedUnit][currentImageIndex].src}
              alt={UNIT_IMAGES[selectedUnit][currentImageIndex].alt}
              className="max-w-full max-h-[85vh] object-contain"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <p className="text-white text-center">
                {UNIT_IMAGES[selectedUnit][currentImageIndex].alt}
              </p>
              <p className="text-white/60 text-center text-sm mt-2">
                {currentImageIndex + 1} / {UNIT_IMAGES[selectedUnit].length}
              </p>
            </div>
          </div>

          {/* Thumbnail strip */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4">
            {UNIT_IMAGES[selectedUnit].map((img, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(idx); }}
                className={`w-16 h-12 flex-shrink-0 overflow-hidden rounded ${
                  idx === currentImageIndex ? 'ring-2 ring-white' : 'opacity-50 hover:opacity-100'
                }`}
              >
                <img src={img.src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
