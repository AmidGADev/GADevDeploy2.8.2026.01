import { PrismaClient } from "@prisma/client";
import { auth } from "./auth";
import * as crypto from "crypto";

const prisma = new PrismaClient();

// Deterministic IDs for seed data (ensures idempotency)
const SEED_IDS = {
  property: crypto.randomUUID(), // Will be replaced by findFirst result if exists
  settings: "default",
  tenantNotificationSettings: crypto.randomUUID(),
};

const PROPERTY_NAME = "Carsons Terrace Rentals";
const ADDRESS = "709 & 711 Carsons Road";
const CITY = "Ottawa";
const PROVINCE = "Ontario";
const POSTAL_CODE = "K1K 2H2";

const UNIT_LABELS = [
  "709A1",
  "709A2",
  "709B1",
  "709B2",
  "711A1",
  "711A2",
  "711B1",
  "711B2",
];

// Unit configurations with rent amounts (in cents)
const UNIT_CONFIGS: Record<string, { bedrooms: number; bathrooms: number; sqft: number; rentAmountCents: number; description: string }> = {
  "709A1": { bedrooms: 1, bathrooms: 1, sqft: 650, rentAmountCents: 175000, description: "Cozy 1-bedroom unit on the ground floor with private entrance" },
  "709A2": { bedrooms: 1, bathrooms: 1, sqft: 650, rentAmountCents: 175000, description: "Cozy 1-bedroom unit on the upper floor with great natural light" },
  "709B1": { bedrooms: 2, bathrooms: 1, sqft: 850, rentAmountCents: 210000, description: "Spacious 2-bedroom unit on the ground floor, perfect for families" },
  "709B2": { bedrooms: 2, bathrooms: 1, sqft: 850, rentAmountCents: 210000, description: "Spacious 2-bedroom unit on the upper floor with city views" },
  "711A1": { bedrooms: 1, bathrooms: 1, sqft: 650, rentAmountCents: 175000, description: "Modern 1-bedroom unit on the ground floor with updated finishes" },
  "711A2": { bedrooms: 1, bathrooms: 1, sqft: 650, rentAmountCents: 175000, description: "Modern 1-bedroom unit on the upper floor with balcony access" },
  "711B1": { bedrooms: 2, bathrooms: 1, sqft: 850, rentAmountCents: 210000, description: "Beautiful 2-bedroom unit on the ground floor with backyard access" },
  "711B2": { bedrooms: 2, bathrooms: 1, sqft: 850, rentAmountCents: 210000, description: "Beautiful 2-bedroom unit on the upper floor with panoramic views" },
};

const MARKETING_OVERVIEW = `Welcome to Carsons Terrace, a modern residential community featuring newly constructed, energy-efficient apartments in the heart of Gloucester, Ottawa. Our thoughtfully designed units offer the perfect balance of comfort and contemporary living, with premium finishes and generous layouts that make coming home a pleasure every day.

Each residence at Carsons Terrace has been crafted with attention to detail, featuring in-suite laundry, modern appliances, and climate control to ensure year-round comfort. Whether you're a young professional, a growing family, or seeking a peaceful retreat, our community provides the ideal setting for your lifestyle.`;

const MARKETING_NEIGHBORHOOD = `Carsons Terrace enjoys an unbeatable location in Gloucester, offering the perfect blend of suburban tranquility and urban convenience. Just a 5-minute walk from La Cité collégiale, residents have easy access to education and the vibrant campus community.

The neighborhood provides excellent connectivity with multiple OC Transpo bus routes nearby, making commutes to downtown Ottawa and beyond effortless. Shopping enthusiasts will appreciate the proximity to major retail centers, while foodies can explore a diverse array of restaurants and cafés.

Essential amenities including medical clinics, pharmacies, and grocery stores are all within easy reach. Families will find quality schools in the area, and the community is surrounded by parks and green spaces perfect for outdoor activities.`;

async function seed() {
  console.log("🌱 Starting seed...");

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: "info@gadevelopments.ca" },
  });

  if (!existingAdmin) {
    // Create admin user using Better Auth
    console.log("Creating admin user...");
    const ctx = await auth.api.signUpEmail({
      body: {
        name: "GA Developments Admin",
        email: "info@gadevelopments.ca",
        password: "Admin123!@#", // Initial password - should be changed
      },
    });

    if (ctx.user) {
      // Update role to ADMIN
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: { role: "ADMIN", status: "ACTIVE" },
      });
      console.log("✅ Admin user created: info@gadevelopments.ca");
    }
  } else {
    console.log("✅ Admin user already exists");
  }

  // Check if property exists
  let property = await prisma.property.findFirst({
    where: { name: PROPERTY_NAME },
  });

  if (!property) {
    console.log("Creating property...");
    property = await prisma.property.create({
      data: {
        name: PROPERTY_NAME,
        address: ADDRESS,
        city: CITY,
        province: PROVINCE,
        postalCode: POSTAL_CODE,
        marketingCopyOverview: MARKETING_OVERVIEW,
        marketingCopyNeighborhood: MARKETING_NEIGHBORHOOD,
      },
    });
    console.log(`✅ Property created: ${PROPERTY_NAME}`);
  } else {
    console.log("✅ Property already exists");
  }

  // Create units
  console.log("Creating units...");
  for (const label of UNIT_LABELS) {
    const config = UNIT_CONFIGS[label];
    if (!config) {
      console.log(`  ⚠️ No config found for unit ${label}, skipping`);
      continue;
    }

    const existingUnit = await prisma.unit.findFirst({
      where: { propertyId: property.id, unitLabel: label },
    });

    if (!existingUnit) {
      await prisma.unit.create({
        data: {
          propertyId: property.id,
          unitLabel: label,
          status: "VACANT",
          rentDueDay: 1,
          rentAmountCents: config.rentAmountCents,
          bedrooms: config.bedrooms,
          bathrooms: config.bathrooms,
          sqft: config.sqft,
          description: config.description,
        },
      });
      console.log(`  ✅ Unit ${label} created`);
    } else {
      // Update existing unit with config data if missing
      if (!existingUnit.rentAmountCents || !existingUnit.bedrooms) {
        await prisma.unit.update({
          where: { id: existingUnit.id },
          data: {
            rentAmountCents: config.rentAmountCents,
            bedrooms: config.bedrooms,
            bathrooms: config.bathrooms,
            sqft: config.sqft,
            description: config.description,
          },
        });
        console.log(`  ✅ Unit ${label} updated with config`);
      } else {
        console.log(`  ✅ Unit ${label} already exists`);
      }
    }
  }

  console.log("\n🎉 Seed completed successfully!");
  console.log("\n📋 Summary:");
  console.log("  - Admin email: info@gadevelopments.ca");
  console.log("  - Admin password: Admin123!@# (please change this!)");
  console.log(`  - Property: ${PROPERTY_NAME}`);
  console.log(`  - Address: ${ADDRESS}, ${CITY}, ${PROVINCE} ${POSTAL_CODE}`);
  console.log(`  - Units: ${UNIT_LABELS.join(", ")}`);

  // Ensure default settings exist
  console.log("\nCreating default settings...");

  const existingSettings = await prisma.settings.findUnique({
    where: { id: SEED_IDS.settings },
  });

  if (!existingSettings) {
    await prisma.settings.create({
      data: {
        id: SEED_IDS.settings,
        etransferEnabled: true,
        etransferRecipientEmail: "rent@gadevelopments.ca",
        etransferMemoTemplate: "{UNIT_LABEL} {MONTH} Rent",
      },
    });
    console.log("  ✅ Default settings created");
  } else {
    console.log("  ✅ Settings already exist");
  }

  // Ensure tenant notification settings exist
  const existingNotificationSettings = await prisma.tenantNotificationSettings.findFirst();

  if (!existingNotificationSettings) {
    await prisma.tenantNotificationSettings.create({
      data: {
        id: crypto.randomUUID(),
        newInvoice: true,
        paymentReceived: true,
        overdueAlert: true,
        maintenanceAcknowledged: true,
        maintenanceStatusUpdate: true,
        maintenanceResolved: true,
        moveInChecklistReminder: true,
        inspectionScheduled: true,
        globalMute: false,
        overdueReminderHours: 72,
        bundleWindowMinutes: 60,
      },
    });
    console.log("  ✅ Tenant notification settings created");
  } else {
    console.log("  ✅ Tenant notification settings already exist");
  }

  console.log("\n✅ All seed operations complete!");
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
