import { Hono } from "hono";
import { prisma } from "../../prisma";
import { authMiddleware, tenantMiddleware } from "../../middleware/auth";
import type { AuthVariables } from "../../middleware/auth";

/**
 * Tenant Documents Router
 * Allows tenants to view documents uploaded by admins (lease agreements, signed docs, etc.)
 */

const tenantDocumentsRouter = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware to all routes
tenantDocumentsRouter.use("*", authMiddleware);
tenantDocumentsRouter.use("*", tenantMiddleware);

/**
 * GET /api/tenant/documents
 * List all documents for the current tenant
 */
tenantDocumentsRouter.get("/", async (c) => {
  const user = c.get("user");

  const documents = await prisma.tenantDocument.findMany({
    where: { userId: user.id },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      description: doc.description,
      uploadedByName: doc.uploadedBy.name,
      createdAt: doc.createdAt.toISOString(),
    })),
  });
});

/**
 * GET /api/tenant/documents/:id
 * Get a specific document's details
 */
tenantDocumentsRouter.get("/:id", async (c) => {
  const user = c.get("user");
  const documentId = c.req.param("id");

  const document = await prisma.tenantDocument.findFirst({
    where: {
      id: documentId,
      userId: user.id, // Ensure tenant can only access their own documents
    },
    include: {
      uploadedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: document.id,
      documentType: document.documentType,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
      description: document.description,
      uploadedByName: document.uploadedBy.name,
      createdAt: document.createdAt.toISOString(),
    },
  });
});

export { tenantDocumentsRouter };
