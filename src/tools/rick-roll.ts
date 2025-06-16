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

  let baseUrl = "http://localhost:3000"; // fallback
  if (context && context.request) {
    const protocol = context.request.protocol;
    const host = context.request.get('host');
    baseUrl = `${protocol}://${host}`;
  }

  const fullGifUrl = `${baseUrl}${gifPath}`;
  const markdown = `![${altText}](${fullGifUrl})`;

  return markdown;
}

tool({
  name: "rick-roll",
  description: "Rick rolls the user",
})(showGif);