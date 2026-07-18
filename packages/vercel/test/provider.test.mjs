import assert from "node:assert/strict";
import test from "node:test";

import { vercelProvider } from "../dist/index.js";

const descriptor = {
  access: "read",
  connectorId: "github",
  description: "List repositories",
  id: "github.repositories/list",
  inputSchema: {
    type: "object",
    properties: { owner: { type: "string" } },
    required: ["owner"],
  },
  name: "listRepositories",
  intentPhrases: ["list GitHub repositories", "show visible repos"],
  presentation: {
    progressPhrases: [
      "Listing GitHub repositories",
      "Scanning visible repos",
    ],
    title: "List GitHub repos",
  },
  requiredScopes: ["repo:read"],
};

test("creates AI SDK tools backed by Toolkit execution", async () => {
  const calls = [];
  const tools = vercelProvider().createTools({
    tools: [descriptor],
    userId: "user_1",
    connectedAccountIds: ["account_1", "account_2"],
    execute: async (...arguments_) => {
      calls.push(arguments_);
      return { ok: true };
    },
  });

  const generated = tools.github_repositories_list;
  assert.equal(
    generated.description,
    "List repositories\nUse when: list GitHub repositories; show visible repos.",
  );
  assert.equal(generated.title, "List GitHub repos");
  assert.deepEqual(generated.metadata, {
    notelabToolkit: {
      access: "read",
      connectorId: "github",
      presentation: {
        progressPhrases: [
          "Listing GitHub repositories",
          "Scanning visible repos",
        ],
        title: "List GitHub repos",
      },
      schemaVersion: 1,
      toolId: "github.repositories/list",
    },
  });

  const result = await generated.execute({ owner: "notelab" }, {});

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    ["github.repositories/list", { owner: "notelab" }, "account_1"],
  ]);
});

test("leaves descriptions unchanged when no intent hints exist", () => {
  const tools = vercelProvider().createTools({
    tools: [{ ...descriptor, id: "github.repositories.list", intentPhrases: [] }],
    userId: "user_1",
    execute: async () => undefined,
  });

  assert.equal(tools.github_repositories_list.description, "List repositories");
});

test("rejects tool identifiers that normalize to the same name", () => {
  assert.throws(
    () =>
      vercelProvider().createTools({
        tools: [
          { ...descriptor, id: "github.repositories/list" },
          { ...descriptor, id: "github.repositories.list" },
        ],
        userId: "user_1",
        execute: async () => undefined,
      }),
    /Toolkit tool name collision for github\.repositories\.list/,
  );
});

test("browser entrypoint rejects adapter construction", async () => {
  const browser = await import("../dist/browser.js");

  assert.throws(
    () => browser.vercelProvider(),
    /server-only.*project API keys/,
  );
});
