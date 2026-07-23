# Zilobase Toolkit SDK

TypeScript clients for using the hosted Zilobase Toolkit backend
from trusted server runtimes. The SDK covers connector discovery, account
authorization, tool selection, and tool execution without bundling connector
credentials or provider clients.

## OpenAI Build Week 2026

Toolkit is the Developer Tools submission: one server-side SDK for adding
approval-aware GitHub, Gmail, Google Calendar, Google Drive, Slack, and Linear
tools to AI applications. Read the form-ready [project story, tags, judge
instructions, and demo outline](./BUILD_WEEK.md).

Codex running GPT-5.6 was used to separate the platform and SDK boundaries,
reconstruct the contract-driven client, add Worker-compatible exports, review
OAuth and credential security, and build the verification suite. The repository
includes a [sanitized Codex session export](./toolkit-session-export-2026-07-19.md)
as supporting evidence.

## Install

```sh
npm install @zilobase/toolkit
```

Applications using Vercel AI SDK tools also need the adapter and its peer
dependency:

```sh
npm install @zilobase/toolkit ai
```

## Create a client

```ts
import { Toolkit } from "@zilobase/toolkit";

const toolkit = new Toolkit({
  apiKey: process.env.TOOLKIT_API_KEY!,
});

const connectors = await toolkit.connectors.list();
```

The SDK connects to the live Toolkit API at `https://api.toolkit-sdk.dev` by
default. Trusted server runtimes may override it for local development:

```ts
const toolkit = new Toolkit({
  apiKey: process.env.TOOLKIT_API_KEY!,
  baseUrl: process.env.TOOLKIT_BASE_URL,
});
```

For the Toolkit cloud adapter's local stack, set `TOOLKIT_BASE_URL` to
`http://localhost:3100`. Do not expose the project API key or construct this
client in browser code.

## Authorize an account

Authorization returns a request that can be redirected to the user and then
polled from the server:

```ts
const request = await toolkit.connectors.authorize("user_123", "gmail", {
  returnUrl: "https://app.example.com/integrations",
  read: "all",
  write: ["gmail.message.send"],
});

console.log(request.redirectUrl);
const account = await request.waitForConnection();
```

Polling stops when the request succeeds, fails, expires, is cancelled, or
reaches the requested timeout.

## Discover and execute tools

```ts
const catalog = await toolkit.tools.list("user_123", {
  connectors: ["gmail", "github"],
  read: "all",
  write: [],
});

const matches = await toolkit.tools.search("open a GitHub issue", {
  userId: "user_123",
  connectors: ["github"],
});

const result = await toolkit.tools.execute("github.issue.create", {
  userId: "user_123",
  arguments: { owner: "zilobase", repository: "app", title: "Build failure" },
});
```

Catalog responses are revalidated with ETags. Tool execution is attempted
exactly once; retry decisions remain with the application.

## Use Vercel AI SDK

```ts
import { Toolkit } from "@zilobase/toolkit";
import { vercelProvider } from "@zilobase/toolkit/vercel";

const toolkit = new Toolkit({
  apiKey: process.env.TOOLKIT_API_KEY!,
  provider: vercelProvider(),
});

const tools = await toolkit.router.get("user_123", {
  connectors: ["gmail", "google-calendar"],
});
```

The recommended router surface contains exactly three model tools: semantic
catalog search, schema retrieval, and policy-checked execution. This avoids
placing thousands of provider schemas in the prompt. Up to 20 known direct
tools can be preloaded with `preload: ["gmail.users.messages.send"]`.

Tool exposure and MCP-aligned annotations are attached as AI SDK metadata,
alongside presentation copy for status UI:

```ts
import { getToolkitToolMetadata } from "@zilobase/toolkit/vercel/metadata";

const metadata = getToolkitToolMetadata(part.toolMetadata);
const statusOptions = metadata?.presentation.progressPhrases;
```

The metadata subpath is safe for browser UI code. The package roots are
server-only because project API keys must not be shipped to browsers.

## Development

```sh
npm install
npm run contract:check
npm run typecheck
npm test
npm run examples:check
```

The committed [OpenAPI contract](openapi/toolkit-v1.json) is the only platform
artifact synchronized into this public repository. Regenerate protocol types
with `npm run contract:generate` after changing it.

## Supported platforms and testing

- Node.js 20 or newer.
- Cloudflare Workers via the `workerd` export condition.
- Trusted Fetch-compatible server runtimes using the optional injected `fetch`.
- Browser UI code may use only the metadata subpath; project API keys must stay
  on the server.

Judges can use the published `@zilobase/toolkit` package and hosted API without
rebuilding the platform. Private test credentials are supplied only through the
Devpost testing notes. Run the full repository verification with:

```sh
npm_config_cache=/tmp/toolkit-sdk-npm-cache npm run ci
```
