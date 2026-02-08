import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

const complianceRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
complianceRouter.use("*", authMiddleware);
complianceRouter.use("*", adminMiddleware);

/**
 * GET /api/admin/compliance/move-in
 * List all tenants with move-in checklist status
 */
complianceRouter.get("/move-in", async (c) => {
  // Get all active tenancies with their MOVE_IN checklist items
  const tenancies = await prisma.tenancy.findMany({
    where: {
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      checklistItems: {
        where: {
          checklistType: "MOVE_IN",
        },
        select: {
          id: true,
          isCompleted: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [
      { unit: { unitLabel: "asc" } },
      { user: { name: "asc" } },
    ],
  });

  const complianceList = tenancies.map((tenancy) => {
    const totalItems = tenancy.checklistItems.length;
    const completedItems = tenancy.checklistItems.filter((item) => item.isCompleted).length;

    // Determine status - Legacy tenants get WAIVED status for move-in
    let checklistStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED";
    if (tenancy.isLegacyMoveIn) {
      checklistStatus = "WAIVED";
    } else if (totalItems === 0) {
      checklistStatus = "NOT_STARTED";
    } else if (completedItems === totalItems) {
      checklistStatus = "COMPLETED";
    } else if (completedItems > 0) {
      checklistStatus = "IN_PROGRESS";
    } else {
      checklistStatus = "NOT_STARTED";
    }

    // Get the most recent update time
    let lastUpdated: Date | null = null;
    if (tenancy.checklistItems.length > 0) {
      lastUpdated = tenancy.checklistItems.reduce((latest, item) => {
        return item.updatedAt > latest ? item.updatedAt : latest;
      }, tenancy.checklistItems[0]!.updatedAt);
    }

    return {
      tenantId: tenancy.user.id,
      tenantName: tenancy.user.name,
      tenantEmail: tenancy.user.email,
      unitId: tenancy.unit.id,
      unitLabel: tenancy.unit.unitLabel,
      buildingName: tenancy.unit.buildingName,
      checklistStatus,
      isLegacyMoveIn: tenancy.isLegacyMoveIn,
      lastUpdated: lastUpdated?.toISOString() || null,
      progress: {
        completed: completedItems,
        total: totalItems,
      },
    };
  });

  return c.json({ data: complianceList });
});

/**
 * GET /api/admin/compliance/move-out
 * List tenants with scheduled move-out dates and their checklist status
 * Query params:
 *   - status: "scheduled" | "completed" | "all" (default: all)
 * Only returns tenancies that have a moveOutDate set
 */
complianceRouter.get("/move-out", async (c) => {
  const statusFilter = c.req.query("status") || "all";

  // Only get tenancies with moveOutDate set
  const tenancies = await prisma.tenancy.findMany({
    where: {
      isActive: true,
      moveOutDate: { not: null },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      moveOutChecklist: {
        select: {
          id: true,
          status: true,
          isFinalized: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [
      { moveOutDate: "asc" },
      { unit: { unitLabel: "asc" } },
    ],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate stats
  let scheduled = 0;
  let inProgress = 0;
  let completed = 0;
  let finalized = 0;
  let overdue = 0;

  const complianceList = tenancies
    .map((tenancy) => {
      const checklist = tenancy.moveOutChecklist;
      const checklistStatus = (checklist?.status || "NOT_STARTED") as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
      const isFinalized = checklist?.isFinalized || false;
      const moveOutDate = tenancy.moveOutDate!;

      // Calculate overdue: moveOutDate in past AND not finalized
      const moveOutDateOnly = new Date(moveOutDate);
      moveOutDateOnly.setHours(0, 0, 0, 0);
      const isOverdue = moveOutDateOnly < today && !isFinalized;

      // Update stats
      if (!isFinalized) {
        scheduled++;
      }
      if (checklistStatus === "IN_PROGRESS") {
        inProgress++;
      }
      if (checklistStatus === "COMPLETED") {
        completed++;
      }
      if (isFinalized) {
        finalized++;
      }
      if (isOverdue) {
        overdue++;
      }

      return {
        tenantId: tenancy.user.id,
        tenantName: tenancy.user.name,
        tenantEmail: tenancy.user.email,
        unitId: tenancy.unit.id,
        unitLabel: tenancy.unit.unitLabel,
        moveOutDate: moveOutDate.toISOString(),
        checklistStatus,
        isFinalized,
        isOverdue,
        lastUpdated: checklist?.updatedAt?.toISOString() || null,
      };
    })
    .filter((item) => {
      // Apply status filter
      if (statusFilter === "scheduled") {
        return !item.isFinalized;
      }
      if (statusFilter === "completed") {
        return item.checklistStatus === "COMPLETED" || item.isFinalized;
      }
      return true; // "all"
    });

  return c.json({
    data: {
      items: complianceList,
      stats: {
        scheduled,
        inProgress,
        completed,
        finalized,
        overdue,
      },
    },
  });
});

/**
 * GET /api/admin/compliance/inspections
 * List all active tenants with their inspection status (both move-in and move-out)
 * Query params:
 *   - type: "MOVE_IN" | "MOVE_OUT" | "all" (default: all)
 */
complianceRouter.get("/inspections", async (c) => {
  const typeFilter = c.req.query("type") || "all";

  // Get all active tenancies with their inspections
  const tenancies = await prisma.tenancy.findMany({
    where: {
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      inspections: true,
    },
    orderBy: [
      { unit: { unitLabel: "asc" } },
      { user: { name: "asc" } },
    ],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate stats
  let notStarted = 0;
  let inProgress = 0;
  let completed = 0;
  let finalized = 0;
  let overdue = 0;

  const inspectionItems: Array<{
    tenantId: string;
    tenantName: string;
    tenantEmail: string;
    unitId: string;
    buildingName: string;
    unitLabel: string;
    inspectionId: string | null;
    inspectionType: "MOVE_IN" | "MOVE_OUT";
    inspectionStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED";
    isFinalized: boolean;
    isLegacyMoveIn: boolean;
    moveOutDate: string | null;
    lastUpdated: string | null;
    isOverdue: boolean;
  }> = [];

  for (const tenancy of tenancies) {
    // Process MOVE_IN inspection
    if (typeFilter === "all" || typeFilter === "MOVE_IN") {
      const moveInInspection = tenancy.inspections.find((i) => i.inspectionType === "MOVE_IN");

      // Legacy tenants get WAIVED status for move-in inspections
      let status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED";
      if (tenancy.isLegacyMoveIn) {
        status = "WAIVED";
      } else {
        status = (moveInInspection?.status as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED") || "NOT_STARTED";
      }
      const isInspectionFinalized = moveInInspection?.isFinalized || false;

      // Update stats (exclude legacy tenants from counts)
      if (!tenancy.isLegacyMoveIn) {
        if (!moveInInspection || status === "NOT_STARTED") notStarted++;
        else if (status === "IN_PROGRESS") inProgress++;
        else if (status === "COMPLETED") completed++;
        if (isInspectionFinalized) finalized++;
      }

      inspectionItems.push({
        tenantId: tenancy.user.id,
        tenantName: tenancy.user.name,
        tenantEmail: tenancy.user.email,
        unitId: tenancy.unit.id,
        buildingName: tenancy.unit.buildingName,
        unitLabel: tenancy.unit.unitLabel,
        inspectionId: moveInInspection?.id || null,
        inspectionType: "MOVE_IN",
        inspectionStatus: status,
        isFinalized: isInspectionFinalized,
        isLegacyMoveIn: tenancy.isLegacyMoveIn,
        moveOutDate: null,
        lastUpdated: moveInInspection?.updatedAt?.toISOString() || null,
        isOverdue: false,
      });
    }

    // Process MOVE_OUT inspection (only if tenant has moveOutDate)
    if ((typeFilter === "all" || typeFilter === "MOVE_OUT") && tenancy.moveOutDate) {
      const moveOutInspection = tenancy.inspections.find((i) => i.inspectionType === "MOVE_OUT");

      const status = moveOutInspection?.status as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" || "NOT_STARTED";
      const isInspectionFinalized = moveOutInspection?.isFinalized || false;

      // Check if overdue
      const moveOutDateOnly = new Date(tenancy.moveOutDate);
      moveOutDateOnly.setHours(0, 0, 0, 0);
      const isOverdueInspection = moveOutDateOnly < today && !isInspectionFinalized;

      // Update stats (only count for MOVE_OUT filter or if showing all)
      if (typeFilter === "MOVE_OUT" || typeFilter === "all") {
        if (!moveOutInspection || status === "NOT_STARTED") notStarted++;
        else if (status === "IN_PROGRESS") inProgress++;
        else if (status === "COMPLETED") completed++;
        if (isInspectionFinalized) finalized++;
        if (isOverdueInspection) overdue++;
      }

      inspectionItems.push({
        tenantId: tenancy.user.id,
        tenantName: tenancy.user.name,
        tenantEmail: tenancy.user.email,
        unitId: tenancy.unit.id,
        buildingName: tenancy.unit.buildingName,
        unitLabel: tenancy.unit.unitLabel,
        inspectionId: moveOutInspection?.id || null,
        inspectionType: "MOVE_OUT",
        inspectionStatus: status,
        isFinalized: isInspectionFinalized,
        isLegacyMoveIn: tenancy.isLegacyMoveIn,
        moveOutDate: tenancy.moveOutDate.toISOString(),
        lastUpdated: moveOutInspection?.updatedAt?.toISOString() || null,
        isOverdue: isOverdueInspection,
      });
    }
  }

  return c.json({
    data: {
      items: inspectionItems,
      stats: {
        notStarted,
        inProgress,
        completed,
        finalized,
        overdue,
      },
    },
  });
});

/**
 * GET /api/admin/compliance/checklists
 * List all checklists (both move-in and move-out) overview
 * Query params:
 *   - type: "MOVE_IN" | "MOVE_OUT" | "all" (default: all)
 */
complianceRouter.get("/checklists", async (c) => {
  const typeFilter = c.req.query("type") || "all";

  // Get all active tenancies
  const tenancies = await prisma.tenancy.findMany({
    where: {
      isActive: true,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitLabel: true,
          buildingName: true,
        },
      },
      checklistItems: {
        select: {
          id: true,
          isCompleted: true,
          checklistType: true,
          updatedAt: true,
        },
      },
    },
    orderBy: [
      { unit: { unitLabel: "asc" } },
      { user: { name: "asc" } },
    ],
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate stats
  let moveInNotStarted = 0;
  let moveInInProgress = 0;
  let moveInCompleted = 0;
  let moveOutNotStarted = 0;
  let moveOutInProgress = 0;
  let moveOutCompleted = 0;
  let moveOutOverdue = 0;

  const checklistItems: Array<{
    tenantId: string;
    tenantName: string;
    tenantEmail: string;
    unitId: string;
    buildingName: string;
    unitLabel: string;
    checklistType: "MOVE_IN" | "MOVE_OUT";
    checklistStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED";
    isLegacyMoveIn: boolean;
    lastUpdated: string | null;
    moveOutDate: string | null;
    isOverdue: boolean;
    progress: { completed: number; total: number };
  }> = [];

  for (const tenancy of tenancies) {
    // Group checklist items by type
    const moveInItems = tenancy.checklistItems.filter((item) => item.checklistType === "MOVE_IN");
    const moveOutItems = tenancy.checklistItems.filter((item) => item.checklistType === "MOVE_OUT");

    // Process MOVE_IN checklist
    if (typeFilter === "all" || typeFilter === "MOVE_IN") {
      const totalMoveIn = moveInItems.length;
      const completedMoveIn = moveInItems.filter((item) => item.isCompleted).length;

      // Legacy tenants get WAIVED status for move-in checklists
      let moveInStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED";
      if (tenancy.isLegacyMoveIn) {
        moveInStatus = "WAIVED";
      } else if (totalMoveIn === 0) {
        moveInStatus = "NOT_STARTED";
      } else if (completedMoveIn === totalMoveIn) {
        moveInStatus = "COMPLETED";
      } else if (completedMoveIn > 0) {
        moveInStatus = "IN_PROGRESS";
      } else {
        moveInStatus = "NOT_STARTED";
      }

      // Update stats (exclude legacy tenants from counts)
      if (!tenancy.isLegacyMoveIn) {
        if (moveInStatus === "NOT_STARTED") moveInNotStarted++;
        if (moveInStatus === "IN_PROGRESS") moveInInProgress++;
        if (moveInStatus === "COMPLETED") moveInCompleted++;
      }

      let lastUpdated: Date | null = null;
      if (moveInItems.length > 0) {
        lastUpdated = moveInItems.reduce((latest, item) => {
          return item.updatedAt > latest ? item.updatedAt : latest;
        }, moveInItems[0]!.updatedAt);
      }

      checklistItems.push({
        tenantId: tenancy.user.id,
        tenantName: tenancy.user.name,
        tenantEmail: tenancy.user.email,
        unitId: tenancy.unit.id,
        buildingName: tenancy.unit.buildingName,
        unitLabel: tenancy.unit.unitLabel,
        checklistType: "MOVE_IN",
        checklistStatus: moveInStatus,
        isLegacyMoveIn: tenancy.isLegacyMoveIn,
        lastUpdated: lastUpdated?.toISOString() || null,
        moveOutDate: null,
        isOverdue: false,
        progress: {
          completed: completedMoveIn,
          total: totalMoveIn,
        },
      });
    }

    // Process MOVE_OUT checklist (only if tenant has moveOutDate)
    if ((typeFilter === "all" || typeFilter === "MOVE_OUT") && tenancy.moveOutDate) {
      const totalMoveOut = moveOutItems.length;
      const completedMoveOut = moveOutItems.filter((item) => item.isCompleted).length;

      let moveOutStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
      if (totalMoveOut === 0) {
        moveOutStatus = "NOT_STARTED";
      } else if (completedMoveOut === totalMoveOut) {
        moveOutStatus = "COMPLETED";
      } else if (completedMoveOut > 0) {
        moveOutStatus = "IN_PROGRESS";
      } else {
        moveOutStatus = "NOT_STARTED";
      }

      // Check if overdue
      const moveOutDateOnly = new Date(tenancy.moveOutDate);
      moveOutDateOnly.setHours(0, 0, 0, 0);
      const isOverdue = moveOutDateOnly < today && moveOutStatus !== "COMPLETED";

      // Update stats
      if (moveOutStatus === "NOT_STARTED") moveOutNotStarted++;
      if (moveOutStatus === "IN_PROGRESS") moveOutInProgress++;
      if (moveOutStatus === "COMPLETED") moveOutCompleted++;
      if (isOverdue) moveOutOverdue++;

      let lastUpdated: Date | null = null;
      if (moveOutItems.length > 0) {
        lastUpdated = moveOutItems.reduce((latest, item) => {
          return item.updatedAt > latest ? item.updatedAt : latest;
        }, moveOutItems[0]!.updatedAt);
      }

      checklistItems.push({
        tenantId: tenancy.user.id,
        tenantName: tenancy.user.name,
        tenantEmail: tenancy.user.email,
        unitId: tenancy.unit.id,
        buildingName: tenancy.unit.buildingName,
        unitLabel: tenancy.unit.unitLabel,
        checklistType: "MOVE_OUT",
        checklistStatus: moveOutStatus,
        isLegacyMoveIn: tenancy.isLegacyMoveIn,
        lastUpdated: lastUpdated?.toISOString() || null,
        moveOutDate: tenancy.moveOutDate.toISOString(),
        isOverdue,
        progress: {
          completed: completedMoveOut,
          total: totalMoveOut,
        },
      });
    }
  }

  return c.json({
    data: {
      items: checklistItems,
      stats: {
        moveIn: {
          notStarted: moveInNotStarted,
          inProgress: moveInInProgress,
          completed: moveInCompleted,
        },
        moveOut: {
          notStarted: moveOutNotStarted,
          inProgress: moveOutInProgress,
          completed: moveOutCompleted,
          overdue: moveOutOverdue,
        },
      },
    },
  });
});

export { complianceRouter };
