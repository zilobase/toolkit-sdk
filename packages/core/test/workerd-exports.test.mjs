import assert from "node:assert/strict";
import test from "node:test";

import { Toolkit } from "@zilobase/toolkit";
import { vercelProvider } from "@zilobase/toolkit/vercel";

test("workerd resolves server SDK exports before browser guards", () => {
  assert.doesNotThrow(
    () => new Toolkit({ apiKey: "nlc_test_workerd-export-resolution" }),
  );
  assert.equal(typeof vercelProvider().createTools, "function");
});
