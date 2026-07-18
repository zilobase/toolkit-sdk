import assert from "node:assert/strict";
import test from "node:test";

import {
  getToolkitToolMetadata,
  TOOLKIT_TOOL_METADATA_KEY,
} from "../dist/metadata.js";

const validMetadata = {
  notelabToolkit: {
    access: "read",
    connectorId: "gmail",
    presentation: {
      progressPhrases: ["Opening the Gmail message"],
      title: "Read Gmail message",
    },
    schemaVersion: 1,
    toolId: "gmail.message.get",
  },
};

test("exports the stable metadata key", () => {
  assert.equal(TOOLKIT_TOOL_METADATA_KEY, "notelabToolkit");
});

test("returns valid Toolkit metadata unchanged", () => {
  const result = getToolkitToolMetadata(validMetadata);

  assert.equal(result, validMetadata.notelabToolkit);
});

test("accepts write metadata and additional fields", () => {
  const metadata = {
    notelabToolkit: {
      ...validMetadata.notelabToolkit,
      access: "write",
      additionalData: "ignored",
    },
  };

  assert.equal(getToolkitToolMetadata(metadata), metadata.notelabToolkit);
});

test("rejects non-object and missing metadata containers", () => {
  assert.equal(getToolkitToolMetadata(undefined), undefined);
  assert.equal(getToolkitToolMetadata(null), undefined);
  assert.equal(getToolkitToolMetadata([]), undefined);
  assert.equal(getToolkitToolMetadata({}), undefined);
  assert.equal(getToolkitToolMetadata({ notelabToolkit: null }), undefined);
});

test("rejects unknown schema versions and access values", () => {
  assert.equal(
    getToolkitToolMetadata({
      notelabToolkit: { ...validMetadata.notelabToolkit, schemaVersion: 2 },
    }),
    undefined,
  );
  assert.equal(
    getToolkitToolMetadata({
      notelabToolkit: { ...validMetadata.notelabToolkit, access: "admin" },
    }),
    undefined,
  );
});

test("rejects missing or blank identifiers", () => {
  for (const field of ["connectorId", "toolId"]) {
    assert.equal(
      getToolkitToolMetadata({
        notelabToolkit: { ...validMetadata.notelabToolkit, [field]: "  " },
      }),
      undefined,
    );
  }
});

test("rejects invalid presentation metadata", () => {
  const invalidPresentations = [
    undefined,
    { title: "Read Gmail message", progressPhrases: [] },
    { title: "  ", progressPhrases: ["Opening the Gmail message"] },
    { title: "Read Gmail message", progressPhrases: ["  "] },
    { title: "Read Gmail message", progressPhrases: "Opening the Gmail message" },
  ];

  for (const presentation of invalidPresentations) {
    assert.equal(
      getToolkitToolMetadata({
        notelabToolkit: { ...validMetadata.notelabToolkit, presentation },
      }),
      undefined,
    );
  }
});
