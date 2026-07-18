"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import {
  Bot,
  Menu,
  MessageSquarePlus,
  Send,
  Square,
  User,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { IntegrationsPanel } from "@/components/integrations-panel";
import { ToolActivity } from "@/components/tool-activity";

const prompts = [
  "Summarize what needs my attention",
  "Find my most recent project updates",
  "List open items assigned to me",
];

export function Chat() {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const {
    addToolApprovalResponse,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    transport,
  });
  const [input, setInput] = useState("");
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const isBusy = status === "submitted" || status === "streaming";
  const latestMessage = messages.at(-1);
  const latestPart = latestMessage?.parts.at(-1);
  const hasStreamingText =
    latestMessage?.role === "assistant" &&
    latestPart?.type === "text" &&
    latestPart.state === "streaming" &&
    latestPart.text.length > 0;
  const hasActiveTool =
    latestPart &&
    isToolUIPart(latestPart) &&
    (latestPart.state === "input-streaming" ||
      latestPart.state === "input-available" ||
      latestPart.state === "approval-requested" ||
      (latestPart.state === "approval-responded" && latestPart.approval.approved));
  const showTyping = isBusy && !hasStreamingText && !hasActiveTool;

  useEffect(() => {
    const messagesElement = messagesRef.current;
    messagesElement?.scrollTo({
      behavior: "smooth",
      top: messagesElement.scrollHeight,
    });
  }, [messages, status]);

  function submit(event?: FormEvent, prompt = input) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || isBusy) return;
    void sendMessage({ text });
    setInput("");
  }

  return (
    <main className="app-shell">
      <IntegrationsPanel open={integrationsOpen} onClose={() => setIntegrationsOpen(false)} />
      {integrationsOpen ? <button className="mobile-backdrop" type="button" aria-label="Close integrations" onClick={() => setIntegrationsOpen(false)} /> : null}

      <section className="chat-shell">
        <header className="chat-header">
          <button className="icon-button mobile-only" type="button" onClick={() => setIntegrationsOpen(true)} aria-label="Open integrations" title="Open integrations">
            <Menu size={19} />
          </button>
          <div className="brand-mark" aria-hidden="true"><Bot size={19} /></div>
          <div className="brand-copy">
            <h1>Toolkit Chat</h1>
            <p><span className="status-dot" /> Tool-enabled assistant</p>
          </div>
          <button className="icon-button new-chat" type="button" onClick={() => setMessages([])} disabled={messages.length === 0 || isBusy} aria-label="New chat" title="New chat">
            <MessageSquarePlus size={18} />
          </button>
        </header>

        <div className="messages" aria-live="polite" ref={messagesRef}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Bot size={25} /></div>
              <h2>What can I help with?</h2>
              <p>Ask across your connected services.</p>
              <div className="prompt-grid">
                {prompts.map((prompt) => (
                  <button type="button" key={prompt} onClick={() => submit(undefined, prompt)}>{prompt}<Send size={14} /></button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <article className={`message message-${message.role}`} key={message.id}>
              <div className="message-avatar" aria-hidden="true">
                {message.role === "user" ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className="message-content">
                <span className="message-author">{message.role === "user" ? "You" : "Toolkit"}</span>
                {message.parts.map((part, index) => {
                  if (part.type === "text") return <p className="message-text" key={index}>{part.text}</p>;
                  if (isToolUIPart(part)) {
                    return (
                      <ToolActivity
                        key={part.toolCallId}
                        onApproval={(id, approved) =>
                          void addToolApprovalResponse({ approved, id })
                        }
                        part={part}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </article>
          ))}

          {showTyping ? (
            <div className="message message-assistant typing-message" role="status" aria-label="Toolkit is typing">
              <div className="message-avatar" aria-hidden="true"><Bot size={16} /></div>
              <div className="message-content">
                <span className="message-author">Toolkit</span>
                <span className="typing-indicator" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          ) : null}

          {error ? <div className="chat-error">{error.message}</div> : null}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask your connected tools"
              aria-label="Chat message"
              rows={1}
            />
            {isBusy ? (
              <button className="send-button" type="button" onClick={stop} aria-label="Stop response" title="Stop response"><Square size={15} fill="currentColor" /></button>
            ) : (
              <button className="send-button" type="submit" disabled={!input.trim()} aria-label="Send message" title="Send message"><Send size={17} /></button>
            )}
          </form>
        </div>
      </section>
    </main>
  );
}
