// Property and content constants for GA Developments
export const PROPERTY = {
  name: "Carsons Terrace Rentals",
  tagline: "Modern Living in Gloucester",
  address: "709 & 711 Carsons Road",
  city: "Ottawa",
  province: "Ontario",
  postalCode: "K1K 2H2",
  fullAddress: "709 & 711 Carsons Road, Ottawa, ON K1K 2H2",
  email: "info@gadevelopments.ca",
  phone: "(613) 555-0123",
};

export const COMPANY = {
  name: "GA Developments",
  email: "info@gadevelopments.ca",
  logo: "/ga-developments--logo-b3.png",
};

export const IMAGES = {
  logo: "/ga-developments--logo-b3.png",
  heroExterior: "/front-page-landing.webp",
  interiorCollage: "/939fd294-0107-49a1-b904-04847771ce3a.webp",
  exteriorCollage: "/b1c3c95f-e166-487f-9d69-38aa2d006ac1.webp",
};

// Unit-specific images
export const UNIT_IMAGES = {
  // 4 Bedroom 2.5 Bath - Upper Level Suite
  fourBedroom: [
    { src: "/2.jpeg", alt: "Living room with open concept to kitchen" },
    { src: "/3.jpeg", alt: "Living room with large windows and natural light" },
    { src: "/4-1.jpeg", alt: "Kitchen with stainless steel appliances" },
    { src: "/5.jpeg", alt: "Full kitchen with butcher block counters" },
    { src: "/6.jpeg", alt: "Bedroom with natural light" },
    { src: "/7.jpeg", alt: "Full bathroom with tub/shower" },
    { src: "/10.jpeg", alt: "In-suite laundry" },
  ],
  // 2 Bedroom 1 Bath - Lower Level Suite
  twoBedroom: [
    { src: "/b15din01.jpeg", alt: "Living and dining area" },
    { src: "/b23kit05.jpeg", alt: "Kitchen with modern appliances" },
    { src: "/b24kit06.jpeg", alt: "Full kitchen with stainless appliances" },
    { src: "/b25main.jpeg", alt: "Modern bathroom with walk-in shower" },
    { src: "/b09ent02.jpeg", alt: "Private entrance" },
  ],
};

export const HERO = {
  title: "Carsons Terrace Rentals",
  subtitle: "Modern, Energy-Efficient Living in Gloucester",
  description: "Newly constructed apartments featuring contemporary design, premium finishes, and unbeatable convenience.",
};

export const OVERVIEW = {
  title: "Welcome Home",
  content: `Welcome to Carsons Terrace, a modern residential community featuring newly constructed, energy-efficient apartments in the heart of Gloucester, Ottawa. Our thoughtfully designed units offer the perfect balance of comfort and contemporary living, with premium finishes and generous layouts that make coming home a pleasure every day.

Each residence at Carsons Terrace has been crafted with attention to detail, featuring in-suite laundry, modern appliances, and climate control to ensure year-round comfort. Whether you're a young professional, a growing family, or seeking a peaceful retreat, our community provides the ideal setting for your lifestyle.`,
};

export const UNIT_TYPES = [
  {
    name: "Upper Level Suite",
    size: "1,300 sq. ft.",
    beds: 4,
    baths: 2.5,
    features: ["Private balcony", "Open-concept living", "Master ensuite", "Walk-in closet"],
    images: "fourBedroom" as const,
    thumbnail: "/3.jpeg",
  },
  {
    name: "Lower Level Suite",
    size: "650 sq. ft.",
    beds: 2,
    baths: 1,
    features: ["Ground floor access", "Cozy layout", "Full kitchen", "In-suite laundry"],
    images: "twoBedroom" as const,
    thumbnail: "/b24kit06.jpeg",
  },
];

export const AMENITIES = {
  parking: [
    "Private driveway parking",
    "Visitor parking available",
    "Snow removal included",
  ],
  utilities: [
    "Water included",
    "Gas included",
    "High-speed internet included",
    "Hydro: Tenant responsibility",
  ],
  inclusions: [
    "In-suite washer & dryer",
    "Stainless steel appliances",
    "Central air conditioning",
    "Modern kitchen with dishwasher",
  ],
  policies: [
    "No smoking",
    "Pet-friendly (case by case)",
    "One-year lease minimum",
  ],
  maintenance: [
    "24/7 emergency maintenance",
    "Professional property management",
    "Regular exterior upkeep",
    "Security cameras on premises",
  ],
  location: [
    "5-minute walk to La Cité",
    "Close to OC Transpo routes",
    "Near shopping & dining",
    "Quick access to downtown",
  ],
};

export const NEIGHBORHOOD = {
  title: "Prime Location",
  content: `Carsons Terrace enjoys an unbeatable location in Gloucester, offering the perfect blend of suburban tranquility and urban convenience. Just a 5-minute walk from La Cité collégiale, residents have easy access to education and the vibrant campus community.

The neighborhood provides excellent connectivity with multiple OC Transpo bus routes nearby, making commutes to downtown Ottawa and beyond effortless. Shopping enthusiasts will appreciate the proximity to major retail centers, while foodies can explore a diverse array of restaurants and cafés.

Essential amenities including medical clinics, pharmacies, and grocery stores are all within easy reach. Families will find quality schools in the area, and the community is surrounded by parks and green spaces perfect for outdoor activities.`,
  highlights: [
    { icon: "GraduationCap", label: "5 min to La Cité" },
    { icon: "Bus", label: "OC Transpo nearby" },
    { icon: "ShoppingBag", label: "Retail & dining" },
    { icon: "Building2", label: "15 min to downtown" },
    { icon: "Stethoscope", label: "Medical nearby" },
    { icon: "Trees", label: "Parks & trails" },
  ],
};

export const GALLERY_IMAGES = [
  { src: "/47cc1d2e-259e-4c6b-96fa-e7587a95629d.webp", alt: "Property exterior - front view with lawn" },
  { src: "/939fd294-0107-49a1-b904-04847771ce3a.webp", alt: "Interior spaces - living room, kitchen, bathroom" },
  { src: "/b1c3c95f-e166-487f-9d69-38aa2d006ac1.webp", alt: "Building exterior - day and evening views" },
];

export const FAQS = [
  {
    question: "What utilities are included in the rent?",
    answer: "Water, gas, and high-speed internet are included in your rent. Tenants are responsible for their own hydro (electricity).",
  },
  {
    question: "Is parking available?",
    answer: "Yes, each unit comes with private driveway parking. Snow removal is included during winter months.",
  },
  {
    question: "Are pets allowed?",
    answer: "We consider pets on a case-by-case basis. Please mention any pets when requesting a showing so we can discuss the specifics.",
  },
  {
    question: "What is the lease term?",
    answer: "We require a minimum one-year lease. After the initial term, the lease typically converts to month-to-month.",
  },
  {
    question: "When was the building constructed?",
    answer: "Carsons Terrace was completed in 2021, featuring modern construction with energy-efficient design and contemporary finishes.",
  },
  {
    question: "How do I pay rent?",
    answer: "Rent can be paid securely online through our tenant portal. We accept credit cards and direct bank payments.",
  },
  {
    question: "Is there on-site laundry?",
    answer: "Each unit comes equipped with its own in-suite washer and dryer for your convenience.",
  },
  {
    question: "How do I request maintenance?",
    answer: "Tenants can submit maintenance requests through our online portal. Emergency maintenance is available 24/7.",
  },
];

export const NAV_LINKS = [
  { href: "#overview", label: "Overview" },
  { href: "#units", label: "Units" },
  { href: "#amenities", label: "Amenities" },
  { href: "#neighborhood", label: "Location" },
  { href: "#gallery", label: "Gallery" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
];
