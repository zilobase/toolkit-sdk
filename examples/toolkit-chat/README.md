# Toolkit Chat

A Next.js chat example using Vercel AI SDK 6 and the local `ai-toolkit-sdk`
package. It is based on Vercel's `next-openai-telemetry` example with all
OpenTelemetry dependencies and runtime instrumentation removed.

## Setup

From this directory:

```sh
cp .env.local.example .env.local
npm install
npm run dev
```

Set these server-only values in `.env.local`:

- `OPENAI_API_KEY`: OpenAI API key used by the chat model.
- `OPENAI_MODEL`: OpenAI model used for chat and tool calls. It defaults to
  `gpt-4o-mini` for fast responses and tool-enabled conversations.
- `TOOLKIT_API_KEY`: project API key created in the Toolkit dashboard.
- `TOOLKIT_BASE_URL`: Toolkit API deployment. The default is the hosted
  `https://toolkit.notelab.io/api/toolkit` endpoint.
- `TOOLKIT_USER_ID`: stable application user identifier used to isolate
  connected accounts.
- `TOOLKIT_RETURN_URL`: optional fallback destination for full-page flows.
  Popup flows complete and close on Toolkit. When omitted, the example derives
  the application origin from the incoming request. The resulting origin must
  be allowlisted for the Toolkit project.
- `TOOLKIT_SHOW_RAW_TOOL_ERRORS`: development-only switch that sends structured
  server-side tool failures to the chat UI. Keep it disabled in production.
- `TOOLKIT_APPROVAL_SECRET`: stable random server secret used to sign write-tool
  approval requests. It is required whenever write tools are enabled.
- `TOOLKIT_WRITE_TOOLS`: optional comma-separated write tool IDs. The example
  enables read tools by default and requires confirmation in the chat UI before
  executing every configured write tool.

`npm run dev` and `npm run build` first build the SDK package from this
repository. The Toolkit project API key remains on the server and is never
included in client-side code.
