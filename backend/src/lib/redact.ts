/**
 * Centralized Secrets Redaction Utility
 *
 * Use this module to redact sensitive information from logs, errors,
 * and any data that might be exposed to clients or logging systems.
 */

/**
 * Patterns that indicate sensitive keys (case-insensitive)
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /bearer/i,
  /credential/i,
  /private/i,
  /^key$/i,
  /^pass$/i,
  /webhook[_-]?secret/i,
  /stripe/i,
  /resend/i,
  /sendgrid/i,
  /session[_-]?id/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /jwt/i,
  /cookie/i,
  /authorization/i,
  /signature/i,
  /cvv/i,
  /cvc/i,
  /card[_-]?number/i,
  /account[_-]?number/i,
  /routing[_-]?number/i,
  /ssn/i,
  /social[_-]?security/i,
  /better[_-]?auth/i,
];

/**
 * Patterns for sensitive values that should always be redacted
 */
const SENSITIVE_VALUE_PATTERNS = [
  // API keys (various formats)
  /^sk_[a-zA-Z0-9_]+$/,           // Stripe secret keys
  /^pk_[a-zA-Z0-9_]+$/,           // Stripe publishable keys
  /^whsec_[a-zA-Z0-9_]+$/,        // Stripe webhook secrets
  /^re_[a-zA-Z0-9_]+$/,           // Resend API keys
  /^SG\.[a-zA-Z0-9_-]+$/,         // SendGrid API keys
  /^Bearer\s+.+$/i,               // Bearer tokens
  /^Basic\s+.+$/i,                // Basic auth
  /^[a-f0-9]{32,}$/i,             // Long hex strings (likely tokens/keys)
  /^eyJ[a-zA-Z0-9_-]*\.eyJ/,      // JWT tokens
];

/**
 * Fields that contain PII and should be partially redacted
 */
const PII_FIELDS = [
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'ssn',
  'socialSecurity',
  'social_security',
  'dateOfBirth',
  'date_of_birth',
  'dob',
  'address',
  'streetAddress',
  'street_address',
];

const REDACTED = '[REDACTED]';
const REDACTED_EMAIL = '***@***.***';

/**
 * Check if a key name indicates sensitive data
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Check if a value matches known sensitive patterns
 */
function isSensitiveValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some(pattern => pattern.test(value));
}

/**
 * Check if a key is a PII field
 */
function isPiiField(key: string): boolean {
  return PII_FIELDS.some(field =>
    key.toLowerCase() === field.toLowerCase() ||
    key.toLowerCase().includes(field.toLowerCase())
  );
}

/**
 * Redact an email address
 */
function redactEmail(email: string): string {
  if (!email || typeof email !== 'string') return email;
  const parts = email.split('@');
  if (parts.length !== 2) return REDACTED;
  const [local, domain] = parts;
  if (!local || !domain) return REDACTED;
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return REDACTED;

  // Show first char of local and TLD
  const redactedLocal = local.length > 1 ? local[0] + '***' : '***';
  const redactedDomain = '***.' + domainParts[domainParts.length - 1];
  return `${redactedLocal}@${redactedDomain}`;
}

/**
 * Redact a phone number (show last 4 digits)
 */
function redactPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return REDACTED;
  return '***-***-' + digits.slice(-4);
}

/**
 * Recursively redact sensitive data from an object
 */
export function redactObject<T>(obj: T, depth: number = 0): T {
  // Prevent infinite recursion
  if (depth > 10) return obj;

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if the string itself is a sensitive value
    if (isSensitiveValue(obj)) {
      return REDACTED as T;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, depth + 1)) as T;
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        // Fully redact sensitive keys
        redacted[key] = REDACTED;
      } else if (isPiiField(key)) {
        // Partially redact PII
        if (key.toLowerCase().includes('email') && typeof value === 'string') {
          redacted[key] = redactEmail(value);
        } else if ((key.toLowerCase().includes('phone')) && typeof value === 'string') {
          redacted[key] = redactPhone(value);
        } else {
          redacted[key] = REDACTED;
        }
      } else if (typeof value === 'string' && isSensitiveValue(value)) {
        // Redact values that look like secrets
        redacted[key] = REDACTED;
      } else if (typeof value === 'object' && value !== null) {
        // Recursively redact nested objects
        redacted[key] = redactObject(value, depth + 1);
      } else {
        redacted[key] = value;
      }
    }

    return redacted as T;
  }

  return obj;
}

/**
 * Redact sensitive data from a string (URLs, error messages, etc.)
 */
export function redactString(str: string): string {
  if (!str || typeof str !== 'string') return str;

  let redacted = str;

  // Redact API keys and tokens in URLs or text
  redacted = redacted.replace(/sk_[a-zA-Z0-9_]+/g, 'sk_[REDACTED]');
  redacted = redacted.replace(/pk_[a-zA-Z0-9_]+/g, 'pk_[REDACTED]');
  redacted = redacted.replace(/whsec_[a-zA-Z0-9_]+/g, 'whsec_[REDACTED]');
  redacted = redacted.replace(/re_[a-zA-Z0-9_]+/g, 're_[REDACTED]');
  redacted = redacted.replace(/SG\.[a-zA-Z0-9_-]+/g, 'SG.[REDACTED]');

  // Redact Bearer tokens
  redacted = redacted.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');

  // Redact Basic auth
  redacted = redacted.replace(/Basic\s+[a-zA-Z0-9+/=]+/gi, 'Basic [REDACTED]');

  // Redact JWT tokens
  redacted = redacted.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[JWT_REDACTED]');

  // Redact email addresses in error messages (optional - might want to keep for debugging)
  // redacted = redacted.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, REDACTED_EMAIL);

  return redacted;
}

/**
 * Redact headers object (commonly contains auth tokens)
 */
export function redactHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[] | undefined> {
  const sensitiveHeaders = [
    'authorization',
    'x-api-key',
    'x-auth-token',
    'x-debug-key',
    'cookie',
    'set-cookie',
    'stripe-signature',
    'x-webhook-secret',
  ];

  const redacted: Record<string, string | string[] | undefined> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.some(h => key.toLowerCase() === h)) {
      redacted[key] = REDACTED;
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Create a safe error object for logging (redacts sensitive data from stack traces)
 */
export function redactError(error: Error | unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactString(error.message),
      stack: error.stack ? redactString(error.stack) : undefined,
    };
  }

  if (typeof error === 'string') {
    return { message: redactString(error) };
  }

  return { message: 'Unknown error' };
}

/**
 * Redact URL query parameters that might contain secrets
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://localhost');
    const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth', 'api_key', 'apikey'];

    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, REDACTED);
      }
    }

    // Also redact the path if it contains token-like segments
    let path = parsed.pathname;
    path = path.replace(/\/[a-f0-9]{32,}\/?/gi, '/[TOKEN_REDACTED]/');

    return parsed.origin + path + (parsed.search ? parsed.search : '');
  } catch {
    // If URL parsing fails, do basic string redaction
    return redactString(url);
  }
}

export { REDACTED, REDACTED_EMAIL };
