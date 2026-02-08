import { useMemo } from "react";
import type { PlaceholderItem } from "./PlaceholderTray";

interface EmailPreviewProps {
  subject: string;
  body: string;
  placeholders: PlaceholderItem[];
}

// GA Developments branded email wrapper (matches backend getEmailTemplate)
function getEmailWrapper(content: string, subject: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a202c;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .email-header {
      background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%);
      padding: 32px 24px;
      text-align: center;
    }
    .logo-text {
      color: #ffffff;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
      margin: 0;
    }
    .email-body {
      padding: 32px 24px;
    }
    .email-body p {
      margin: 0 0 16px 0;
      color: #4a5568;
    }
    .email-body strong {
      color: #1a365d;
    }
    .email-body ul, .email-body ol {
      margin: 0 0 16px 0;
      padding-left: 24px;
      color: #4a5568;
    }
    .email-body li {
      margin-bottom: 8px;
    }
    .email-button {
      display: inline-block;
      background: linear-gradient(135deg, #1a365d 0%, #2c5282 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 8px 0;
    }
    .info-box {
      background: #f8fafc;
      border-left: 4px solid #2c5282;
      padding: 16px;
      margin: 16px 0;
      border-radius: 0 8px 8px 0;
    }
    .info-box p {
      margin: 4px 0;
    }
    .email-footer {
      background: #f8fafc;
      padding: 24px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer-text {
      font-size: 12px;
      color: #718096;
      margin: 4px 0;
    }
    a {
      color: #2c5282;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <p class="logo-text">GA Developments</p>
    </div>
    <div class="email-body">
      ${content}
    </div>
    <div class="email-footer">
      <p class="footer-text">GA Developments Property Management</p>
      <p class="footer-text">709 & 711 Carsons Road, Ottawa, ON K1K 2H2</p>
      <p class="footer-text">
        <a href="mailto:info@gadevelopments.ca">info@gadevelopments.ca</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

function replacePlaceholders(
  content: string,
  placeholders: PlaceholderItem[]
): string {
  let result = content;
  for (const placeholder of placeholders) {
    const regex = new RegExp(`\\{\\{${placeholder.key}\\}\\}`, "g");
    result = result.replace(
      regex,
      `<span style="background: #dbeafe; color: #1e40af; padding: 1px 4px; border-radius: 3px; font-weight: 500;">${placeholder.example}</span>`
    );
  }
  // Remove conditional blocks
  result = result.replace(/\{\{#if \w+\}\}/g, "");
  result = result.replace(/\{\{\/if\}\}/g, "");
  return result;
}

export function EmailPreview({
  subject,
  body,
  placeholders,
}: EmailPreviewProps) {
  const previewHtml = useMemo(() => {
    const populatedSubject = replacePlaceholders(subject, placeholders);
    const populatedBody = replacePlaceholders(body, placeholders);
    return getEmailWrapper(populatedBody, populatedSubject);
  }, [subject, body, placeholders]);

  const populatedSubject = useMemo(() => {
    return replacePlaceholders(subject, placeholders).replace(
      /<span[^>]*>([^<]*)<\/span>/g,
      "$1"
    );
  }, [subject, placeholders]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b bg-muted/30 rounded-t-md">
        <p className="text-xs text-muted-foreground mb-1">Subject Preview</p>
        <p className="text-sm font-medium truncate">{populatedSubject}</p>
      </div>
      <div className="flex-1 overflow-auto bg-slate-100 rounded-b-md">
        <iframe
          srcDoc={previewHtml}
          title="Email Preview"
          className="w-full h-full min-h-[400px] border-0"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
