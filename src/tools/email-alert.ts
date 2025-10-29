import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface EmailAlertParameters {
  to: string;
  subject: string;
  message: string;
  emailService?: "sendgrid" | "mailgun" | "resend" | "webhook";
  apiKey?: string;
  webhookUrl?: string;
}

interface EmailAlertResult {
  success: boolean;
  message: string;
  provider: string;
  timestamp: string;
}

async function emailAlert(
  parameters: EmailAlertParameters
): Promise<EmailAlertResult> {
  const {
    to,
    subject,
    message,
    emailService = "webhook",
    apiKey,
    webhookUrl,
  } = parameters;

  if (!to || to.trim() === "") {
    throw new Error("Email recipient (to) is required");
  }

  if (!subject || subject.trim() === "") {
    throw new Error("Email subject is required");
  }

  if (!message || message.trim() === "") {
    throw new Error("Email message is required");
  }

  const timestamp = new Date().toISOString();

  try {
    switch (emailService) {
      case "sendgrid":
        if (!apiKey) {
          throw new Error("SendGrid API key is required");
        }
        return await sendViaSendGrid(to, subject, message, apiKey, timestamp);

      case "mailgun":
        if (!apiKey) {
          throw new Error("Mailgun API key is required");
        }
        return await sendViaMailgun(to, subject, message, apiKey, timestamp);

      case "resend":
        if (!apiKey) {
          throw new Error("Resend API key is required");
        }
        return await sendViaResend(to, subject, message, apiKey, timestamp);

      case "webhook":
        if (!webhookUrl) {
          throw new Error("Webhook URL is required for webhook email service");
        }
        return await sendViaWebhook(
          to,
          subject,
          message,
          webhookUrl,
          timestamp
        );

      default:
        throw new Error(`Unsupported email service: ${emailService}`);
    }
  } catch (error) {
    throw new Error(
      `Failed to send email alert: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function sendViaSendGrid(
  to: string,
  subject: string,
  message: string,
  apiKey: string,
  timestamp: string
): Promise<EmailAlertResult> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to }],
          subject: subject,
        },
      ],
      from: { email: "alerts@optimizely.com", name: "Optimizely SRM Monitor" },
      content: [
        {
          type: "text/html",
          value: formatEmailHTML(message),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SendGrid API error: ${response.statusText} - ${errorText}`);
  }

  return {
    success: true,
    message: "Email sent successfully via SendGrid",
    provider: "sendgrid",
    timestamp,
  };
}

async function sendViaMailgun(
  to: string,
  subject: string,
  message: string,
  apiKey: string,
  timestamp: string
): Promise<EmailAlertResult> {
  // Note: You'll need to configure your Mailgun domain
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "mg.yourdomain.com";

  const formData = new URLSearchParams();
  formData.append("from", "Optimizely SRM Monitor <alerts@" + MAILGUN_DOMAIN + ">");
  formData.append("to", to);
  formData.append("subject", subject);
  formData.append("html", formatEmailHTML(message));

  const response = await fetch(
    `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mailgun API error: ${response.statusText} - ${errorText}`);
  }

  return {
    success: true,
    message: "Email sent successfully via Mailgun",
    provider: "mailgun",
    timestamp,
  };
}

async function sendViaResend(
  to: string,
  subject: string,
  message: string,
  apiKey: string,
  timestamp: string
): Promise<EmailAlertResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Optimizely SRM Monitor <alerts@resend.dev>",
      to: [to],
      subject: subject,
      html: formatEmailHTML(message),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error: ${response.statusText} - ${errorText}`);
  }

  return {
    success: true,
    message: "Email sent successfully via Resend",
    provider: "resend",
    timestamp,
  };
}

async function sendViaWebhook(
  to: string,
  subject: string,
  message: string,
  webhookUrl: string,
  timestamp: string
): Promise<EmailAlertResult> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      subject,
      message,
      html: formatEmailHTML(message),
      timestamp,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Webhook error: ${response.statusText} - ${errorText}`
    );
  }

  return {
    success: true,
    message: "Email alert sent successfully via webhook",
    provider: "webhook",
    timestamp,
  };
}

function formatEmailHTML(message: string): string {
  // Convert plain text message to formatted HTML
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      background: #f8f9fa;
      padding: 30px;
      border-radius: 0 0 8px 8px;
      border: 1px solid #e9ecef;
      border-top: none;
    }
    .alert-badge {
      display: inline-block;
      padding: 8px 16px;
      background: #dc3545;
      color: white;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .message {
      background: white;
      padding: 20px;
      border-radius: 6px;
      border-left: 4px solid #667eea;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e9ecef;
      font-size: 12px;
      color: #6c757d;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚨 Optimizely SRM Alert</h1>
  </div>
  <div class="content">
    <span class="alert-badge">⚠️ ATTENTION REQUIRED</span>
    <div class="message">${escapeHtml(message)}</div>
  </div>
  <div class="footer">
    <p>This is an automated alert from Optimizely Opal SRM Monitor</p>
    <p>Sent at ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m).replace(/\n/g, '<br>');
}

tool({
  name: "email-alert",
  description:
    "Sends email alerts for critical issues like Sample Ratio Mismatch detection. Supports multiple email providers (SendGrid, Mailgun, Resend) and custom webhooks. Formats messages with HTML for better readability.",
  parameters: [
    {
      name: "to",
      type: ParameterType.String,
      description: "Email recipient address (e.g., 'nuno.figueiredo@optimizely.com')",
      required: true,
    },
    {
      name: "subject",
      type: ParameterType.String,
      description: "Email subject line",
      required: true,
    },
    {
      name: "message",
      type: ParameterType.String,
      description: "Email message body (plain text, will be formatted as HTML)",
      required: true,
    },
    {
      name: "emailService",
      type: ParameterType.String,
      description:
        'Email service provider: "sendgrid", "mailgun", "resend", or "webhook". Defaults to "webhook".',
      required: false,
    },
    {
      name: "apiKey",
      type: ParameterType.String,
      description:
        "API key for the email service (required for sendgrid, mailgun, resend)",
      required: false,
    },
    {
      name: "webhookUrl",
      type: ParameterType.String,
      description:
        "Webhook URL to send email data to (required when emailService is 'webhook')",
      required: false,
    },
  ],
})(emailAlert);
