import { tool } from "@optimizely-opal/opal-tools-sdk";

interface ShowGifParameters {
  gifPath?: string;
  altText?: string;
}

async function showGif(parameters: ShowGifParameters) {
  const { gifPath = "/public/rick.gif", altText = "Rick Astley" } = parameters;

  const markdown = `![${altText}](${gifPath})`;

  return markdown;
}

tool({
  name: "rick-roll",
  description: "Rick rolls the user",
})(showGif);