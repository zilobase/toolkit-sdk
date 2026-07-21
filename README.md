# Zilobase Toolkit SDK

TypeScript clients for using the hosted Zilobase Toolkit backend
from trusted server runtimes. The SDK covers connector discovery, account
authorization, tool selection, and tool execution without bundling connector
credentials or provider clients.

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

The SDK always connects to the live Toolkit API at
`https://api.toolkit-sdk.dev`.

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

const tools = await toolkit.tools.get("user_123", {
  connectors: ["gmail"],
  read: "all",
  write: [],
});
```

Backend-managed intent phrases help the model select tools. Presentation copy
is kept out of prompts and is attached as AI SDK tool metadata for status UI:

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
