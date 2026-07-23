import type { ToolkitProvider } from "../types.js";
import { jsonSchema, tool, type ToolSet } from "ai";

function normalizeToolName(toolId: string): string {
  return toolId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function vercelProvider(): ToolkitProvider<ToolSet> {
  return {
    createTools({ tools, execute, connectedAccountIds }) {
      const toolSet: ToolSet = {};

      for (const descriptor of tools) {
        const name = normalizeToolName(descriptor.id);
        if (toolSet[name]) {
          throw new Error(`Toolkit tool name collision for ${descriptor.id}.`);
        }

        toolSet[name] = tool({
          description: descriptor.description,
          inputSchema: jsonSchema(descriptor.inputSchema),
          metadata: {
            zilobaseToolkit: {
              access: descriptor.access,
              annotations: descriptor.annotations,
              connectorId: descriptor.connectorId,
              exposure: descriptor.exposure,
              presentation: {
                progressPhrases: [...descriptor.presentation.progressPhrases],
                title: descriptor.presentation.title,
              },
              schemaVersion: 1,
              toolId: descriptor.id,
            },
          },
          needsApproval: descriptor.access === "write",
          title: descriptor.presentation.title,
          execute: (arguments_) =>
            execute(descriptor.id, arguments_, connectedAccountIds?.[0]),
        });
      }

      return toolSet;
    },
  };
}
