"use client";

import { Check, CircleAlert, LoaderCircle, Wrench, X } from "lucide-react";
import {
  getToolName,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import { getToolkitToolMetadata } from "ai-toolkit-sdk/vercel/metadata";

type ToolActivityProps = {
  onApproval: (id: string, approved: boolean) => void;
  part: DynamicToolUIPart | ToolUIPart;
};

export function ToolActivity({ onApproval, part }: ToolActivityProps) {
  const metadata = getToolkitToolMetadata(part.toolMetadata);
  const awaitingApproval = part.state === "approval-requested";
  const running =
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    (part.state === "approval-responded" && part.approval.approved);
  const failed = part.state === "output-error" || part.state === "output-denied";
  const title = metadata?.presentation.title || part.title || getToolName(part).replaceAll("_", " ");
  const status = awaitingApproval
    ? "Review this action"
    : running
    ? metadata?.presentation.progressPhrases[0] || "Running tool"
    : failed
      ? part.state === "output-error"
        ? part.errorText
        : "Action denied"
      : "Completed";

  return (
    <div className={`tool-activity ${failed ? "tool-activity-error" : ""}`}>
      <span className="tool-status-icon" aria-hidden="true">
        {running ? <LoaderCircle className="spin" size={16} /> : failed ? <CircleAlert size={16} /> : <Check size={16} />}
      </span>
      <div className="tool-activity-content">
        <div className="tool-title"><Wrench size={13} /> {title}</div>
        <p>{status}</p>
        {awaitingApproval ? (
          <div className="tool-approval">
            <pre>{JSON.stringify(part.input, null, 2)}</pre>
            <div className="tool-approval-actions">
              <button type="button" onClick={() => onApproval(part.approval.id, false)}>
                <X size={14} /> Deny
              </button>
              <button className="approve" type="button" onClick={() => onApproval(part.approval.id, true)}>
                <Check size={14} /> Approve
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
