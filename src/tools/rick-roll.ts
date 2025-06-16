import { tool } from "@optimizely-opal/opal-tools-sdk";
import { Request } from "express";

interface ShowGifParameters {
  gifPath?: string;
  altText?: string;
}

async function showGif(
  parameters: ShowGifParameters,
  context?: { request?: Request }
) {
  const { gifPath = "/public/rick.gif", altText = "Rick Astley" } = parameters;

  // Use BASE_URL from environment variable, fallback to localhost
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  const fullGifUrl = `${baseUrl}${gifPath}`;
  const markdown = `![${altText}](${fullGifUrl})`;

  return markdown;
}

tool({
  name: "rick-roll",
  description: "Rick rolls the user",
})(showGif);