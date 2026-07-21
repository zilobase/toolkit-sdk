import { Toolkit } from "@zilobase/toolkit";
import { vercelProvider } from "@zilobase/toolkit/vercel";
import { getToolkitToolMetadata } from "@zilobase/toolkit/vercel/metadata";
import { streamText, type LanguageModel } from "ai";

const toolkit = new Toolkit({
  apiKey: process.env.TOOLKIT_API_KEY!,
  provider: vercelProvider(),
});

export function authorizeGmail(userId: string, returnUrl: string) {
  return toolkit.connectors.authorize(userId, "gmail", {
    returnUrl,
    read: "all",
    write: [],
  });
}

export const tools = await toolkit.tools.get("user_123", {
  connectors: ["gmail", "github"],
  read: "all",
  write: [],
});

export function answer(model: LanguageModel, prompt: string) {
  return streamText({ model, prompt, tools }).toUIMessageStreamResponse();
}

export function getToolStatus(part: { toolMetadata?: unknown }) {
  const metadata = getToolkitToolMetadata(part.toolMetadata);

  return metadata
    ? {
        progressPhrases: metadata.presentation.progressPhrases,
        title: metadata.presentation.title,
        toolId: metadata.toolId,
      }
    : undefined;
}
