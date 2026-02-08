import { prisma } from "../prisma";

/**
 * Migrate existing units to extract building name from unitLabel
 * Examples:
 * - "709A1" -> buildingName: "709 Carsons", unitLabel: "A1"
 * - "711B2" -> buildingName: "711 Carsons", unitLabel: "B2"
 */
async function migrateBuildingNames() {
  const units = await prisma.unit.findMany();

  for (const unit of units) {
    // Parse the unitLabel to extract building prefix
    // Pattern: starts with 709 or 711, followed by unit identifier
    const match = unit.unitLabel.match(/^(709|711)(.+)$/);

    if (match) {
      const buildingPrefix = match[1]; // "709" or "711"
      const unitNumber = match[2]; // "A1", "B2", etc.
      const buildingName = `${buildingPrefix} Carsons`;

      await prisma.unit.update({
        where: { id: unit.id },
        data: {
          buildingName,
          unitLabel: unitNumber,
        },
      });

      console.log(
        `Migrated: ${unit.unitLabel} -> Building: ${buildingName}, Unit: ${unitNumber}`
      );
    } else {
      console.log(`Skipped (no pattern match): ${unit.unitLabel}`);
    }
  }

  console.log("Migration complete!");
}

migrateBuildingNames()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
