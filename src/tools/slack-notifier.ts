import { tool, ParameterType } from "@optimizely-opal/opal-tools-sdk";

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: any[];
  fields?: any[];
  accessory?: any;
}

interface SlackNotifierParameters {
  channel: string;
  message: string;
  webhookUrl?: string;
  priority?: "critical" | "high" | "medium" | "low";
  attachScreenshots?: boolean;
  screenshots?: string[] | string;
  formatAsBlocks?: boolean;
}

interface SlackNotifierResult {
  success: boolean;
  channel: string;
  timestamp: string;
  messageLength: number;
  error?: string;
}

/**
 * Convert priority to Slack emoji and color
 */
function getPriorityIndicators(priority: string): {
  emoji: string;
  color: string;
} {
  switch (priority) {
    case "critical":
      return { emoji: "🚨", color: "#d32f2f" };
    case "high":
      return { emoji: "⚠️", color: "#f57c00" };
    case "medium":
      return { emoji: "ℹ️", color: "#1976d2" };
    case "low":
      return { emoji: "📝", color: "#388e3c" };
    default:
      return { emoji: "📋", color: "#757575" };
  }
}

/**
 * Parse markdown-style report into Slack blocks
 */
function convertMarkdownToBlocks(markdown: string): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  const lines = markdown.split("\n");

  let currentSection: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines in lists
    if (!line && inList) {
      continue;
    }

    // Heading
    if (line.startsWith("# ")) {
      if (currentSection.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: currentSection.join("\n"),
          },
        });
        currentSection = [];
      }
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: line.replace(/^# /, ""),
        },
      });
      blocks.push({ type: "divider" });
      inList = false;
    }
    // Subheading
    else if (line.startsWith("## ")) {
      if (currentSection.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: currentSection.join("\n"),
          },
        });
        currentSection = [];
      }
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${line.replace(/^## /, "")}*`,
        },
      });
      inList = false;
    }
    // List items or bullet points
    else if (line.startsWith("- ") || line.startsWith("* ") || /^\d+\./.test(line)) {
      currentSection.push(line);
      inList = true;
    }
    // Regular text
    else if (line) {
      currentSection.push(line);
      inList = false;
    }
    // Empty line - flush section
    else if (currentSection.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: currentSection.join("\n"),
        },
      });
      currentSection = [];
      inList = false;
    }
  }

  // Flush remaining content
  if (currentSection.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: currentSection.join("\n"),
      },
    });
  }

  return blocks;
}

/**
 * Send message to Slack using webhook
 */
async function sendToSlackWebhook(
  webhookUrl: string,
  blocks: SlackBlock[],
  text: string
): Promise<void> {
  const payload = {
    text, // Fallback text
    blocks,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Slack webhook returned ${response.status}: ${await response.text()}`
    );
  }
}

/**
 * Format report as rich Slack blocks
 */
function formatReportAsBlocks(
  message: string,
  priority: string = "medium"
): SlackBlock[] {
  const { emoji, color } = getPriorityIndicators(priority);

  // If message is markdown-formatted, convert it
  if (message.includes("# ") || message.includes("## ")) {
    return convertMarkdownToBlocks(message);
  }

  // Otherwise, create a simple formatted message
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Competitive Intelligence Update`,
      },
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: message,
      },
    },
  ];

  return blocks;
}

/**
 * Main slack notifier function
 */
async function slackNotifier(
  parameters: SlackNotifierParameters
): Promise<SlackNotifierResult> {
  const {
    channel,
    message,
    webhookUrl,
    priority = "medium",
    attachScreenshots = false,
    screenshots: screenshotsParam = [],
    formatAsBlocks = true,
  } = parameters;

  // Parse screenshots if passed as JSON string
  const screenshots: string[] = typeof screenshotsParam === "string"
    ? JSON.parse(screenshotsParam)
    : screenshotsParam || [];

  if (!channel || channel.trim() === "") {
    throw new Error("channel is required and cannot be empty");
  }

  if (!message || message.trim() === "") {
    throw new Error("message is required and cannot be empty");
  }

  try {
    // Format message
    let blocks: SlackBlock[];
    if (formatAsBlocks) {
      blocks = formatReportAsBlocks(message, priority);
    } else {
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message,
          },
        },
      ];
    }

    // Add timestamp
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Generated at ${new Date().toLocaleString()} | Priority: ${priority}`,
        },
      ],
    });

    // Send to Slack
    if (webhookUrl) {
      await sendToSlackWebhook(webhookUrl, blocks, message);
    } else {
      // In development/testing, just log
      console.log("=== SLACK MESSAGE (no webhook configured) ===");
      console.log(`Channel: ${channel}`);
      console.log(`Priority: ${priority}`);
      console.log(`Message Preview: ${message.substring(0, 200)}...`);
      console.log("=== Blocks ===");
      console.log(JSON.stringify(blocks, null, 2));
      console.log("======================");
    }

    return {
      success: true,
      channel,
      timestamp: new Date().toISOString(),
      messageLength: message.length,
    };
  } catch (error) {
    return {
      success: false,
      channel,
      timestamp: new Date().toISOString(),
      messageLength: message.length,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

tool({
  name: "slack-notifier",
  description:
    "Sends formatted notifications and reports to Slack channels. Supports rich formatting with Slack blocks, priority indicators, and markdown conversion. Can be used for alerts, competitive intelligence reports, experiment summaries, and team notifications.",
  parameters: [
    {
      name: "channel",
      type: ParameterType.String,
      description:
        "Slack channel to send the message to (e.g., '#competitive-intelligence', '#product-team')",
      required: true,
    },
    {
      name: "message",
      type: ParameterType.String,
      description:
        "Message content to send. Can be plain text or markdown-formatted. Markdown headings (# and ##) will be converted to Slack block formatting.",
      required: true,
    },
    {
      name: "webhookUrl",
      type: ParameterType.String,
      description:
        "Slack webhook URL for sending messages. If not provided, message will be logged to console (useful for testing).",
      required: false,
    },
    {
      name: "priority",
      type: ParameterType.String,
      description:
        "Message priority level: 'critical', 'high', 'medium', or 'low'. Affects emoji and visual styling. Defaults to 'medium'.",
      required: false,
    },
    {
      name: "attachScreenshots",
      type: ParameterType.Boolean,
      description:
        "Whether to attach screenshots to the message. Defaults to false.",
      required: false,
    },
    {
      name: "screenshots",
      type: ParameterType.String,
      description:
        "JSON array of screenshot URLs or base64 data to attach to the message.",
      required: false,
    },
    {
      name: "formatAsBlocks",
      type: ParameterType.Boolean,
      description:
        "Whether to format the message using Slack blocks for rich formatting. Defaults to true.",
      required: false,
    },
  ],
})(slackNotifier);
