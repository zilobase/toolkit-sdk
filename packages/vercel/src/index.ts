import type { ToolkitProvider } from "@notelab/toolkit";
import { jsonSchema, tool, type ToolSet } from "ai";

function normalizeToolName(toolId: string): string {
  return toolId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function addIntentHints(description: string, intentPhrases: readonly string[]): string {
  if (intentPhrases.length === 0) return description;
  return `${description}\nUse when: ${intentPhrases.join("; ")}.`;
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
          description: addIntentHints(
            descriptor.description,
            descriptor.intentPhrases,
          ),
          inputSchema: jsonSchema(descriptor.inputSchema),
          metadata: {
            notelabToolkit: {
              access: descriptor.access,
              connectorId: descriptor.connectorId,
              presentation: {
                progressPhrases: [...descriptor.presentation.progressPhrases],
                title: descriptor.presentation.title,
              },
              schemaVersion: 1,
              toolId: descriptor.id,
            },
          },
          title: descriptor.presentation.title,
          execute: (arguments_) =>
            execute(descriptor.id, arguments_, connectedAccountIds?.[0]),
        });
      }

      return toolSet;
    },
  };
}
