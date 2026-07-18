export const TOOLKIT_TOOL_METADATA_KEY = "notelabToolkit";

export type ToolkitToolMetadata = {
  access: "read" | "write";
  connectorId: string;
  presentation: {
    progressPhrases: string[];
    title: string;
  };
  schemaVersion: 1;
  toolId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getToolkitToolMetadata(
  toolMetadata: unknown,
): ToolkitToolMetadata | undefined {
  if (!isRecord(toolMetadata)) return undefined;

  const candidate = toolMetadata[TOOLKIT_TOOL_METADATA_KEY];
  if (!isRecord(candidate) || candidate.schemaVersion !== 1) return undefined;
  if (candidate.access !== "read" && candidate.access !== "write") {
    return undefined;
  }
  if (
    !isNonEmptyString(candidate.connectorId) ||
    !isNonEmptyString(candidate.toolId)
  ) {
    return undefined;
  }
  if (!isRecord(candidate.presentation)) return undefined;
  if (!isNonEmptyString(candidate.presentation.title)) return undefined;

  const progressPhrases = candidate.presentation.progressPhrases;
  if (
    !Array.isArray(progressPhrases) ||
    progressPhrases.length === 0 ||
    !progressPhrases.every(isNonEmptyString)
  ) {
    return undefined;
  }

  return candidate as ToolkitToolMetadata;
}
