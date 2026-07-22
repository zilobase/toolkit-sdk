# OpenAI Build Week 2026 — Toolkit

## Project story

### About the project

AI applications can call a model in a few lines, but connecting that model to
real work is still repetitive and risky. Every integration tends to recreate
OAuth, encrypted credential storage, account isolation, tool schemas,
permissions, approval UX, retries, and provider-specific error handling.

I built **Toolkit** to turn that infrastructure into one server-side SDK and a
hosted connector platform. An application creates a `Toolkit` client, identifies
its user, chooses the connectors and access it wants, and receives typed tools
that can be passed directly to an AI workflow. Toolkit currently supports
GitHub, Gmail, Google Calendar, Google Drive, Slack, and Linear.

The project has three deliberately separate parts:

- the Toolkit platform owns identity, OAuth, encrypted credentials, policies,
  audit data, connector execution, and the administration UI;
- `@zilobase/toolkit` is the public, framework-neutral TypeScript SDK;
- the Vercel AI SDK adapter converts the remote catalog into tools while
  preserving approval and presentation metadata.

### Inspiration

Toolkit grew out of building connected AI features for Zilobase. I did not want
every product feature—or every future application—to embed provider secrets and
reimplement the same authorization machinery. The goal became a reusable
developer boundary: product code should ask for capabilities, while a dedicated
service handles credentials and provider execution.

### How I built it

The hosted platform uses a React administration app, a Hono API, Better Auth,
PostgreSQL, and a private connector runtime. Credentials are encrypted with a
versioned AES-256-GCM keyring. Workspace roles, project API keys, OAuth
configuration, connection policies, and every database query are scoped on the
server.

The public SDK is generated against a committed OpenAPI contract. It supports
connector discovery, connected-account authorization, polling, catalog
selection, search, execution, cancellation, timeouts, structured errors, and
ETag revalidation. Tool execution is attempted exactly once: the calling
application—not the SDK—decides whether a side effect is safe to retry.

For AI applications, model-facing intent phrases and user-facing progress copy
are separate. This keeps presentation text out of prompts while still giving
the UI useful status metadata. Write tools require approval in the included
chat example.

### Challenges

The hardest part was extracting Toolkit into a standalone product without
leaking Zilobase authentication, schemas, or deployment assumptions into it.
Other challenges included keeping project API keys out of browser bundles,
supporting both Node.js and Cloudflare Workers, routing browser authentication
and the public API across separate origins, and making OAuth completion safe for
popup and full-page flows.

Contract tests, browser export guards, explicit runtime injection, host
validation, encrypted credentials, and a dedicated Cloudflare adapter became
the guardrails that made those boundaries testable.

### What I learned

I learned that the best abstraction for AI integrations is not a large client
library full of provider code. It is a small server-only client backed by a
versioned remote contract. I also learned that intent, authorization, execution,
and presentation should be separate concepts: combining them makes prompts
noisy and side effects harder to reason about.

### How Codex and GPT-5.6 were used

Codex running GPT-5.6 was the primary engineering collaborator for the Build
Week implementation. I used it to map the original coupled code, define the
repository boundaries, reconstruct the public SDK from the API contract,
implement and review Worker-compatible exports, reason through OAuth and
credential threat boundaries, build focused tests, and repeatedly verify the
package and example.

The important product decisions remained explicit: Toolkit would be standalone;
API keys would stay server-only; connector execution would never be retried
automatically; write capabilities would be opt-in and approval-aware; and the
OpenAPI document would be the only public platform contract. A sanitized Codex
session export is checked into this repository so judges can inspect the actual
build process. The corresponding `/feedback` session ID is supplied in the
Devpost submission.

## Built with

`TypeScript`, `SDK`, `Developer Tools`, `AI Agents`, `Tool Calling`, `OAuth`,
`OpenAI`, `GPT-5.6`, `Codex`, `Vercel AI SDK`, `Cloudflare Workers`, `Node.js`,
`Hono`, `PostgreSQL`, `Better Auth`, `OpenAPI`, `React`, `Security`,
`Integrations`, `Self-Hosted`

## Installation and supported platforms

Install the public package from npm:

```sh
npm install @zilobase/toolkit
```

For Vercel AI SDK tools, install the optional peer dependency too:

```sh
npm install @zilobase/toolkit ai
```

Supported trusted server runtimes:

- Node.js 20 or newer;
- Cloudflare Workers through the package's `workerd` export condition;
- server frameworks that provide a standards-compatible `fetch`, or accept an
  injected `fetch` implementation.

The package root is intentionally unavailable to browser bundles because it
requires a project API key. The `@zilobase/toolkit/vercel/metadata` entrypoint is
browser-safe for rendering tool status.

## Judge testing

Judges do not need to rebuild the hosted platform.

1. Open [the Toolkit dashboard](https://app.toolkit-sdk.dev) and use the account
   supplied in Devpost's private testing notes.
2. Use the project API key supplied in those private notes. It is never stored
   in this repository or in client-side code.
3. Install the npm package, set `TOOLKIT_API_KEY`, and list the live catalog:

   ```ts
   import { Toolkit } from "@zilobase/toolkit";

   const toolkit = new Toolkit({
     apiKey: process.env.TOOLKIT_API_KEY!,
   });

   console.log(await toolkit.connectors.list());
   ```

4. To test the complete AI flow, follow
   [`examples/toolkit-chat`](./examples/toolkit-chat/README.md). The example
   demonstrates account authorization, read tools, write-tool approval, tool
   execution, and browser-safe status metadata.
5. To verify the repository itself:

   ```sh
   npm install
   npm_config_cache=/tmp/toolkit-sdk-npm-cache npm run ci
   ```

For local platform development and self-hosting, see the
[Toolkit platform repository](https://github.com/sreeragh-s/mainlab).

## Demo video outline (under three minutes)

1. **0:00–0:25 — Problem:** show the OAuth, credential, and provider plumbing an
   AI application normally needs.
2. **0:25–0:55 — Install:** install `@zilobase/toolkit` and create a server-only
   client.
3. **0:55–1:25 — Connect:** open the hosted dashboard and launch an account
   connection.
4. **1:25–2:05 — Use:** load the remote catalog in Toolkit Chat and execute a
   read tool.
5. **2:05–2:30 — Control:** show a write tool pausing for explicit approval and
   the UI rendering Toolkit metadata.
6. **2:30–2:55 — Build process:** show the tests and explain how Codex with
   GPT-5.6 accelerated the architecture, implementation, and review.

## Submission checklist

- Developer Tools category selected.
- Public repository URL and npm package included.
- Hosted dashboard and private judge credentials included.
- Public YouTube demo is shorter than three minutes.
- Demo audio explains both Codex and GPT-5.6 usage.
- Toolkit `/feedback` session ID pasted into Devpost, not committed to Git.
