import { tool } from "@optimizely-opal/opal-tools-sdk";
import { Request } from "express";

interface ShowGifParameters {
  gifPath?: string;
  altText?: string;
}

async function showGif(parameters: ShowGifParameters, context: { request: Request }) {
  const { gifPath = "/rick.gif", altText = "Rick Astley" } = parameters;
  
  const protocol = context.request.protocol;
  const host = context.request.get('host');
  const baseUrl = `${protocol}://${host}`;
  
  const fullGifUrl = `${baseUrl}${gifPath}`;
  const markdown = `![${altText}](${fullGifUrl})`;

  return markdown;
}

tool({
  name: "rick-roll",
  description: "Rick rolls the user",
})(showGif);