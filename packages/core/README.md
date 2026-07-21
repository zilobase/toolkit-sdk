# `@zilobase/toolkit`

Framework-neutral TypeScript client for the Zilobase Toolkit API. Use it only
in trusted server runtimes because construction requires a project API key.

```ts
import { Toolkit } from "@zilobase/toolkit";

const toolkit = new Toolkit({
  apiKey: process.env.TOOLKIT_API_KEY!,
});

const connectors = await toolkit.connectors.list();
const accounts = await toolkit.connectedAccounts.list("user_123");
const tools = await toolkit.tools.get("user_123", {
  read: "all",
  write: [],
});
```

The client always uses the live API at `https://api.toolkit-sdk.dev`. An
injected `fetch`, request timeout, and abort signals are supported for server
runtime integration.

The `@zilobase/toolkit/protocol` subpath exposes types generated from the public
OpenAPI contract. It does not expose backend implementation details.

## Vercel AI SDK

Install the optional `ai` peer dependency to convert Toolkit descriptors into
Vercel AI SDK 6 tools:

```ts
import { Toolkit } from "@zilobase/toolkit";
import { vercelProvider } from "@zilobase/toolkit/vercel";

const toolkit = new Toolkit({
  apiKey: process.env.TOOLKIT_API_KEY!,
  provider: vercelProvider(),
});

const tools = await toolkit.tools.get("user_123", {
  connectors: ["github"],
  read: "all",
  write: [],
});
```

Browser UI code can read tool-call presentation data without loading the
server adapter:

```ts
import { getToolkitToolMetadata } from "@zilobase/toolkit/vercel/metadata";

const metadata = getToolkitToolMetadata(part.toolMetadata);
```
