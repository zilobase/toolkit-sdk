import type { components } from "./generated/api.js";

type Schemas = components["schemas"];

export type Connector = Schemas["Connector"];
export type ConnectedAccount = Schemas["ConnectedAccount"];
export type ConnectionRequestStatus = Schemas["ConnectionRequestStatus"];
export type ToolDescriptor = Schemas["ToolDescriptor"];
export type ToolPresentation = Schemas["ToolPresentation"];
export type ToolAccess = Schemas["ToolAccess"];
export type ToolAnnotations = Schemas["ToolAnnotations"];
export type ToolExposure = Schemas["ToolExposure"];
export type ToolRouterMatch = Schemas["RouterToolMatch"];
export type JsonSchema = Schemas["JsonSchema"];

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

export interface ListResponse<T> {
  items: T[];
  nextCursor?: string;
}

export type ToolReadSelection = "all" | string[] | false;

export interface ToolSelection {
  connectors?: string[];
  exposure?: "all" | ToolExposure;
  read?: ToolReadSelection;
  write?: string[];
  connectedAccountIds?: string[];
}

interface AuthorizeOptionsBase {
  read?: ToolReadSelection;
  write?: string[];
  connectedAccountId?: string;
  signal?: AbortSignal;
}

export type AuthorizeOptions = AuthorizeOptionsBase &
  (
    | { returnUrl: string; redirectUrl?: never }
    | {
        returnUrl?: never;
        /** @deprecated Use returnUrl for the application destination. */
        redirectUrl: string;
      }
  );

export interface WaitForConnectionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface ExecuteToolOptions {
  userId: string;
  arguments: unknown;
  connectedAccountId?: string;
  signal?: AbortSignal;
}

export interface SearchToolsOptions {
  userId: string;
  connectors?: string[];
  limit?: number;
  signal?: AbortSignal;
}

export interface RouterSearchOptions extends RequestOptions {
  connectors?: string[];
  exposure?: "all" | ToolExposure;
  limit?: number;
}

export interface RouterGetOptions extends RouterSearchOptions {
  connectedAccountIds?: string[];
  preload?: string[];
}

export interface ProviderContext {
  tools: ToolDescriptor[];
  userId: string;
  connectedAccountIds?: string[];
  execute: (
    toolId: string,
    arguments_: unknown,
    connectedAccountId?: string,
  ) => Promise<unknown>;
}

export interface ToolkitProvider<Output = unknown> {
  createTools(context: ProviderContext): Output;
}

export type ProviderOutput<Provider> = Provider extends ToolkitProvider<infer Output>
  ? Output
  : ToolDescriptor[];

export type RouterProviderOutput<Provider> =
  Provider extends ToolkitProvider<infer Output> ? Output : ToolDescriptor[];

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ToolkitOptions<Provider extends ToolkitProvider | undefined = undefined> {
  apiKey: string;
  /** Overrides the hosted Toolkit API URL, primarily for local development. */
  baseUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  provider?: Provider;
}
