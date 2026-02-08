import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";
import { UpdateBuildingInfoSchema, CreateBuildingInfoSchema } from "../../types";
import type { EmergencyContact } from "../../types";
import { generateGarbageScheduleEvents } from "../../lib/calendar-notifications";
import {
  validateSyncPrerequisites,
  syncBuildingGarbageSchedule,
  getBuildingSyncStatus,
} from "../../lib/calendar-sync";

const adminBuildingInfoRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
adminBuildingInfoRouter.use("*", authMiddleware);
adminBuildingInfoRouter.use("*", adminMiddleware);

/**
 * Helper to parse emergency contacts from JSON string
 */
function parseEmergencyContacts(json: string | null): EmergencyContact[] | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Helper to format building info response
 */
function formatBuildingInfo(buildingInfo: {
  id: string;
  buildingName: string;
  parkingRules: string | null;
  garbageSchedule: string | null;
  garbageScheduleStructured: string | null;
  quietHours: string | null;
  emergencyContacts: string | null;
  customNotes: string | null;
  updatedAt: Date;
}) {
  return {
    id: buildingInfo.id,
    buildingName: buildingInfo.buildingName,
    parkingRules: buildingInfo.parkingRules,
    garbageSchedule: buildingInfo.garbageSchedule,
    garbageScheduleStructured: buildingInfo.garbageScheduleStructured,
    quietHours: buildingInfo.quietHours,
    emergencyContacts: parseEmergencyContacts(buildingInfo.emergencyContacts),
    customNotes: buildingInfo.customNotes,
    updatedAt: buildingInfo.updatedAt.toISOString(),
  };
}

/**
 * GET /api/admin/building-info
 * List all building infos
 */
adminBuildingInfoRouter.get("/", async (c) => {
  const buildingInfos = await prisma.buildingInfo.findMany({
    orderBy: { buildingName: "asc" },
  });

  return c.json({
    data: buildingInfos.map(formatBuildingInfo),
  });
});

/**
 * GET /api/admin/building-info/:buildingName
 * Get specific building info by buildingName
 */
adminBuildingInfoRouter.get("/:buildingName", async (c) => {
  const buildingName = decodeURIComponent(c.req.param("buildingName"));

  const buildingInfo = await prisma.buildingInfo.findUnique({
    where: { buildingName },
  });

  if (!buildingInfo) {
    return c.json({
      data: {
        id: null,
        buildingName,
        parkingRules: null,
        garbageSchedule: null,
        garbageScheduleStructured: null,
        quietHours: null,
        emergencyContacts: null,
        customNotes: null,
        updatedAt: null,
      },
    });
  }

  return c.json({
    data: formatBuildingInfo(buildingInfo),
  });
});

/**
 * PUT /api/admin/building-info/:buildingName
 * Create or update building info (upsert by buildingName)
 */
adminBuildingInfoRouter.put("/:buildingName", zValidator("json", UpdateBuildingInfoSchema), async (c) => {
  const buildingName = decodeURIComponent(c.req.param("buildingName"));
  const data = c.req.valid("json");
  const user = c.get("user");

  // Serialize emergency contacts to JSON string if provided
  const emergencyContactsJson = data.emergencyContacts !== undefined
    ? (data.emergencyContacts ? JSON.stringify(data.emergencyContacts) : null)
    : undefined;

  // Check if garbage schedule is being updated (structured takes priority)
  const isGarbageScheduleChanging = data.garbageScheduleStructured !== undefined || data.garbageSchedule !== undefined;

  // Use upsert to create or update by buildingName
  const buildingInfo = await prisma.buildingInfo.upsert({
    where: { buildingName },
    update: {
      ...(data.parkingRules !== undefined && { parkingRules: data.parkingRules }),
      ...(data.garbageSchedule !== undefined && { garbageSchedule: data.garbageSchedule }),
      ...(data.garbageScheduleStructured !== undefined && { garbageScheduleStructured: data.garbageScheduleStructured }),
      ...(data.quietHours !== undefined && { quietHours: data.quietHours }),
      ...(emergencyContactsJson !== undefined && { emergencyContacts: emergencyContactsJson }),
      ...(data.customNotes !== undefined && { customNotes: data.customNotes }),
      updatedById: user.id,
    },
    create: {
      buildingName,
      parkingRules: data.parkingRules ?? null,
      garbageSchedule: data.garbageSchedule ?? null,
      garbageScheduleStructured: data.garbageScheduleStructured ?? null,
      quietHours: data.quietHours ?? null,
      emergencyContacts: emergencyContactsJson ?? null,
      customNotes: data.customNotes ?? null,
      updatedById: user.id,
    },
  });

  // If garbage schedule changed (structured takes priority), regenerate calendar events
  let eventsGenerated = 0;
  if (isGarbageScheduleChanging) {
    eventsGenerated = await generateGarbageScheduleEvents(
      buildingInfo.id,
      buildingInfo.buildingName,
      buildingInfo.garbageScheduleStructured || buildingInfo.garbageSchedule,
      user.id
    );
  }

  return c.json({
    data: {
      ...formatBuildingInfo(buildingInfo),
      garbageEventsGenerated: isGarbageScheduleChanging ? eventsGenerated : undefined,
    },
  });
});

/**
 * POST /api/admin/building-info/:buildingName/sync-calendar
 * Explicitly sync garbage schedule to calendar events
 * Uses transaction-based sync for atomicity and data consistency
 */
adminBuildingInfoRouter.post("/:buildingName/sync-calendar", async (c) => {
  const buildingName = decodeURIComponent(c.req.param("buildingName"));
  const user = c.get("user");

  // Validate prerequisites (Save-Before-Sync pattern)
  const validation = await validateSyncPrerequisites(buildingName);
  if (!validation.valid) {
    return c.json(
      { error: { message: validation.error, code: "SYNC_PREREQUISITE_FAILED" } },
      400
    );
  }

  const buildingInfo = validation.buildingInfo!;
  const scheduleData = buildingInfo.garbageScheduleStructured || buildingInfo.garbageSchedule;

  // Perform the sync using the calendar-sync service
  const syncResult = await syncBuildingGarbageSchedule(
    buildingInfo.id,
    buildingInfo.buildingName,
    scheduleData,
    user.id
  );

  // Get current sync status for additional feedback
  const syncStatus = await getBuildingSyncStatus(buildingName);

  if (!syncResult.success) {
    return c.json(
      {
        error: {
          message: "Calendar sync failed",
          code: "SYNC_FAILED",
          details: syncResult.errors,
        },
      },
      500
    );
  }

  return c.json({
    data: {
      success: true,
      eventsGenerated: syncResult.adminEventsCreated,
      eventsDeleted: syncResult.adminEventsDeleted,
      buildingName,
      tenantsAffected: syncResult.tenantsAffected,
      syncTimestamp: syncResult.timestamp,
      syncStatus: {
        hasSchedule: syncStatus.hasSchedule,
        totalEvents: syncStatus.eventCount,
        lastEventDate: syncStatus.lastEventDate?.toISOString() || null,
      },
    },
  });
});

/**
 * DELETE /api/admin/building-info/:buildingName
 * Delete building info by buildingName
 */
adminBuildingInfoRouter.delete("/:buildingName", async (c) => {
  const buildingName = decodeURIComponent(c.req.param("buildingName"));

  const existing = await prisma.buildingInfo.findUnique({
    where: { buildingName },
  });

  if (!existing) {
    return c.json({ error: { message: "Building info not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.buildingInfo.delete({
    where: { buildingName },
  });

  return c.json({ data: { success: true } });
});

export { adminBuildingInfoRouter };
