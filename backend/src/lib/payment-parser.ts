import { prisma } from "../prisma";
import { env } from "../env";
import { webhookLogger } from "./logger";

/**
 * AI Payment Parser Interface
 */
export interface ParsedPaymentData {
  senderName: string | null;
  amountCents: number | null;
  referenceNumber: string | null;
  confidence: number;
  error?: string;
}

/**
 * Matched tenant result
 */
export interface MatchedTenant {
  userId: string;
  name: string;
  email: string;
  unitLabel?: string | null;
  buildingName?: string | null;
}

/**
 * Matched invoice result
 */
export interface MatchedInvoice {
  invoiceId: string;
  unitId: string;
  periodMonth: string;
  amountCents: number;
  status: string;
  buildingName: string;
  unitLabel: string;
}

/**
 * Parse Interac e-Transfer email using OpenAI
 */
export async function parseInteracEmail(emailBody: string, emailSubject: string): Promise<ParsedPaymentData> {
  // Check if OpenAI is configured
  if (!env.OPENAI_API_KEY) {
    webhookLogger.warn("OpenAI API key not configured - using fallback regex parsing");
    return fallbackRegexParse(emailBody, emailSubject);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert at parsing Interac e-Transfer notification emails.
Extract the following information from the email:
1. Sender Name - The person who sent the money (NOT the bank, the actual person)
2. Amount - The dollar amount sent (return as cents, e.g., $2,700.00 = 270000)
3. Reference Number - The Interac reference/confirmation number

Return ONLY a JSON object with these exact keys:
{
  "senderName": "string or null",
  "amountCents": number or null,
  "referenceNumber": "string or null",
  "confidence": number between 0 and 1
}

Be precise. If you cannot find a field with high confidence, set it to null.
The confidence score should reflect how certain you are about ALL fields combined.`,
          },
          {
            role: "user",
            content: `Subject: ${emailSubject}\n\nBody:\n${emailBody}`,
          },
        ],
        temperature: 0.1, // Low temperature for consistent extraction
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not find JSON in OpenAI response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      senderName: parsed.senderName || null,
      amountCents: typeof parsed.amountCents === "number" ? parsed.amountCents : null,
      referenceNumber: parsed.referenceNumber || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch (error) {
    webhookLogger.error("OpenAI parsing failed, falling back to regex", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...fallbackRegexParse(emailBody, emailSubject),
      error: error instanceof Error ? error.message : "OpenAI parsing failed",
    };
  }
}

/**
 * Fallback regex-based parsing for Interac e-Transfer emails
 */
export function fallbackRegexParse(emailBody: string, emailSubject: string): ParsedPaymentData {
  let senderName: string | null = null;
  let amountCents: number | null = null;
  let referenceNumber: string | null = null;

  // Common patterns in Interac e-Transfer emails
  const combinedText = `${emailSubject}\n${emailBody}`;

  // Extract sender name patterns
  // "from John Smith" or "John Smith sent you"
  const senderPatterns = [
    /from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+sent\s+you/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+has\s+sent/i,
    /Sender:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];

  for (const pattern of senderPatterns) {
    const match = combinedText.match(pattern);
    if (match && match[1]) {
      senderName = match[1].trim();
      break;
    }
  }

  // Extract amount patterns
  // "$2,700.00" or "CAD 2700.00" or "2,700.00 CAD"
  const amountPatterns = [
    /\$\s*([\d,]+\.?\d*)/,
    /CAD\s*([\d,]+\.?\d*)/i,
    /([\d,]+\.?\d*)\s*CAD/i,
    /amount[:\s]+\$?\s*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = combinedText.match(pattern);
    if (match && match[1]) {
      // Remove commas and convert to cents
      const amountStr = match[1].replace(/,/g, "");
      const amount = parseFloat(amountStr);
      if (!isNaN(amount)) {
        amountCents = Math.round(amount * 100);
        break;
      }
    }
  }

  // Extract reference number patterns
  // Various formats: alphanumeric codes
  const refPatterns = [
    /reference[:\s#]+([A-Za-z0-9]+)/i,
    /confirmation[:\s#]+([A-Za-z0-9]+)/i,
    /ref[:\s#]+([A-Za-z0-9]+)/i,
    /transfer\s+(?:id|number|#)[:\s]*([A-Za-z0-9]+)/i,
    // Interac specific pattern (usually 12-character alphanumeric)
    /\b([A-Za-z0-9]{10,14})\b/,
  ];

  for (const pattern of refPatterns) {
    const match = combinedText.match(pattern);
    if (match && match[1]) {
      referenceNumber = match[1].trim();
      break;
    }
  }

  // Calculate confidence based on how many fields we found
  const foundFields = [senderName, amountCents, referenceNumber].filter(Boolean).length;
  const confidence = foundFields / 3;

  return {
    senderName,
    amountCents,
    referenceNumber,
    confidence,
  };
}

/**
 * Match sender name to tenant in database using fuzzy matching
 */
export async function matchTenantByName(senderName: string): Promise<MatchedTenant | null> {
  if (!senderName) return null;

  // Normalize the sender name
  const normalizedName = senderName.toLowerCase().trim();
  const nameParts = normalizedName.split(/\s+/);

  // Get all active tenants with their unit info
  const tenants = await prisma.user.findMany({
    where: {
      role: "TENANT",
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      email: true,
      tenancies: {
        where: { isActive: true },
        select: {
          unit: {
            select: {
              unitLabel: true,
              buildingName: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  // Score each tenant based on name similarity
  let bestMatch: { user: typeof tenants[0]; score: number } | null = null;

  for (const tenant of tenants) {
    if (!tenant.name) continue;

    const tenantNameNorm = tenant.name.toLowerCase().trim();
    const tenantParts = tenantNameNorm.split(/\s+/);

    let score = 0;

    // Exact match
    if (tenantNameNorm === normalizedName) {
      score = 1.0;
    } else {
      // Partial matching
      for (const part of nameParts) {
        if (tenantNameNorm.includes(part)) {
          score += 0.3;
        }
      }
      for (const part of tenantParts) {
        if (normalizedName.includes(part)) {
          score += 0.3;
        }
      }
      // Cap at 0.9 for non-exact matches
      score = Math.min(score, 0.9);
    }

    if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { user: tenant, score };
    }
  }

  if (bestMatch) {
    const activeTenancy = bestMatch.user.tenancies[0];
    return {
      userId: bestMatch.user.id,
      name: bestMatch.user.name || "Unknown",
      email: bestMatch.user.email,
      unitLabel: activeTenancy?.unit.unitLabel || null,
      buildingName: activeTenancy?.unit.buildingName || null,
    };
  }

  return null;
}

/**
 * Find the oldest pending/overdue invoice for a tenant
 */
export async function findOldestPendingInvoice(userId: string, amountCents: number): Promise<MatchedInvoice | null> {
  // Get the tenant's active tenancies
  const tenancies = await prisma.tenancy.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: { id: true },
  });

  if (tenancies.length === 0) return null;

  const tenancyIds = tenancies.map((t) => t.id);

  // Find the oldest pending/overdue invoice that matches the amount
  const invoice = await prisma.invoice.findFirst({
    where: {
      tenancyId: { in: tenancyIds },
      status: { in: ["OPEN", "OVERDUE"] },
      amountCents: amountCents,
    },
    orderBy: { dueDate: "asc" },
    include: {
      unit: {
        select: {
          buildingName: true,
          unitLabel: true,
        },
      },
    },
  });

  if (!invoice) return null;

  return {
    invoiceId: invoice.id,
    unitId: invoice.unitId,
    periodMonth: invoice.periodMonth,
    amountCents: invoice.amountCents,
    status: invoice.status,
    buildingName: invoice.unit.buildingName,
    unitLabel: invoice.unit.unitLabel,
  };
}

/**
 * Find any pending/overdue invoice for a tenant (without amount matching)
 * Used for test webhook to show potential matches
 */
export async function findPendingInvoicesForTenant(userId: string): Promise<MatchedInvoice[]> {
  // Get the tenant's active tenancies
  const tenancies = await prisma.tenancy.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: { id: true },
  });

  if (tenancies.length === 0) return [];

  const tenancyIds = tenancies.map((t) => t.id);

  // Find all pending/overdue invoices
  const invoices = await prisma.invoice.findMany({
    where: {
      tenancyId: { in: tenancyIds },
      status: { in: ["OPEN", "OVERDUE"] },
    },
    orderBy: { dueDate: "asc" },
    include: {
      unit: {
        select: {
          buildingName: true,
          unitLabel: true,
        },
      },
    },
    take: 5, // Limit to 5 for the test endpoint
  });

  return invoices.map((invoice) => ({
    invoiceId: invoice.id,
    unitId: invoice.unitId,
    periodMonth: invoice.periodMonth,
    amountCents: invoice.amountCents,
    status: invoice.status,
    buildingName: invoice.unit.buildingName,
    unitLabel: invoice.unit.unitLabel,
  }));
}
