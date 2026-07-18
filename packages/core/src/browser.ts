export { ToolkitError } from "./errors.js";
export type * from "./types.js";

export class Toolkit {
  constructor() {
    throw new Error(
      "@notelab/toolkit uses a secret project API key and cannot run in browser JavaScript. Use it from a trusted server runtime.",
    );
  }
}
