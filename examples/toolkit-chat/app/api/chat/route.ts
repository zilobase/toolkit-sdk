import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { ToolkitError } from "ai-toolkit-sdk";

import {
  getToolkit,
  getToolkitUserId,
  getToolkitWriteTools,
} from "@/lib/toolkit";

export const maxDuration = 60;

function formatRawToolError(error: unknown) {
  if (error instanceof ToolkitError) {
    return JSON.stringify({
      code: error.code,
      details: error.details,
      message: error.message,
      name: error.name,
      requestId: error.requestId,
      status: error.status,
    });
  }
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: UIMessage[] };
    if (!Array.isArray(body.messages)) {
      return Response.json({ error: "messages must be an array." }, { status: 400 });
    }

    const writeTools = getToolkitWriteTools();
    const tools = await getToolkit().tools.get(getToolkitUserId(), {
      read: "all",
      write: writeTools,
    });
    const approvalSecret = process.env.TOOLKIT_APPROVAL_SECRET?.trim();
    if (writeTools.length > 0 && !approvalSecret) {
      throw new Error(
        "TOOLKIT_APPROVAL_SECRET is required when write tools are enabled.",
      );
    }

    const result = streamText({
      experimental_toolApprovalSecret: approvalSecret,
      model: openai(process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini"),
      system:
        "You are a concise assistant with access to the user's connected services. " +
        "Use Toolkit tools when they can answer the request. Never claim a tool action succeeded unless its result confirms it.",
      messages: await convertToModelMessages(body.messages),
      tools,
      stopWhen: stepCountIs(6),
    });

    return result.toUIMessageStreamResponse({
      onError:
        process.env.TOOLKIT_SHOW_RAW_TOOL_ERRORS?.trim().toLowerCase() === "true"
          ? formatRawToolError
          : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat request failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
