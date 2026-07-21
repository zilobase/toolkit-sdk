import "server-only";

import { Toolkit } from "@zilobase/toolkit";
import { vercelProvider } from "@zilobase/toolkit/vercel";

let toolkit: Toolkit<ReturnType<typeof vercelProvider>> | undefined;

export const TOOLKIT_CHAT_CONNECTORS = [
  "github",
  "gmail",
  "google-calendar",
  "google-drive",
] as const;

const toolkitChatConnectorIds = new Set<string>(TOOLKIT_CHAT_CONNECTORS);

export function isToolkitChatConnector(connectorId: string) {
  return toolkitChatConnectorIds.has(connectorId);
}

export function getToolkit() {
  const apiKey = process.env.TOOLKIT_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TOOLKIT_API_KEY is not configured.");
  }

  toolkit ??= new Toolkit({
    apiKey,
    provider: vercelProvider(),
  });

  return toolkit;
}

export function getToolkitUserId() {
  return process.env.TOOLKIT_USER_ID?.trim() || "toolkit-chat-example";
}

export function getToolkitWriteTools(connectorId?: string) {
  const tools = (process.env.TOOLKIT_WRITE_TOOLS ?? "")
    .split(",")
    .map((toolId) => toolId.trim())
    .filter(
      (toolId) =>
        toolId &&
        TOOLKIT_CHAT_CONNECTORS.some((allowed) =>
          toolId.startsWith(`${allowed}.`),
        ),
    );

  return connectorId
    ? tools.filter((toolId) => toolId.startsWith(`${connectorId}.`))
    : tools;
}

export function getToolkitReturnUrl(requestUrl: string) {
  return (
    process.env.TOOLKIT_RETURN_URL?.trim() ||
    process.env.TOOLKIT_REDIRECT_URL?.trim() ||
    new URL("/", requestUrl).toString()
  );
}
