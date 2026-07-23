import { ConnectionRequest, type ConnectionRequestSnapshot } from "./connection-request.js";
import { ToolkitError } from "./errors.js";
import { Transport } from "./transport.js";
import type {
  AuthorizeOptions,
  ConnectedAccount,
  Connector,
  ExecuteToolOptions,
  ListResponse,
  PaginationOptions,
  ProviderOutput,
  RequestOptions,
  RouterGetOptions,
  RouterProviderOutput,
  RouterSearchOptions,
  SearchToolsOptions,
  ToolkitOptions,
  ToolkitProvider,
  ToolDescriptor,
  ToolRouterMatch,
  ToolSelection,
} from "./types.js";

const TOOLKIT_API_URL = "https://api.toolkit-sdk.dev";
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ToolkitError("baseUrl must be an absolute HTTP or HTTPS URL.", {
      code: "INVALID_BASE_URL",
    });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolkitError("baseUrl must use HTTP or HTTPS.", {
      code: "INVALID_BASE_URL",
    });
  }

  return value.replace(/\/+$/, "");
}

export class ConnectorsResource {
  constructor(
    private readonly transport: Transport,
    private readonly accounts: ConnectedAccountsResource,
  ) {}

  list(options: PaginationOptions & RequestOptions = {}): Promise<ListResponse<Connector>> {
    return this.transport.request("/v1/connectors", {
      query: {
        cursor: options.cursor,
        limit: options.limit,
      },
      signal: options.signal,
    });
  }

  get(connectorId: string, options: RequestOptions = {}): Promise<Connector> {
    return this.transport.request(
      `/v1/connectors/${encodeURIComponent(connectorId)}`,
      { signal: options.signal },
    );
  }

  authorize(
    userId: string,
    connectorId: string,
    options: AuthorizeOptions,
  ): Promise<ConnectionRequest> {
    return this.accounts.authorize(userId, connectorId, options);
  }
}

export class ConnectedAccountsResource {
  constructor(private readonly transport: Transport) {}

  async authorize(
    userId: string,
    connectorId: string,
    options: AuthorizeOptions,
  ): Promise<ConnectionRequest> {
    const snapshot = await this.transport.request<ConnectionRequestSnapshot>(
      "/v1/connected-accounts/authorize",
      {
        method: "POST",
        body: {
          userId,
          connectorId,
          redirectUrl: options.returnUrl ?? options.redirectUrl,
          read: options.read ?? "all",
          write: options.write ?? [],
          connectedAccountId: options.connectedAccountId,
        },
        signal: options.signal,
      },
    );

    return new ConnectionRequest(this.transport, snapshot);
  }

  list(
    userId: string,
    options: PaginationOptions & RequestOptions & { connectorId?: string } = {},
  ): Promise<ListResponse<ConnectedAccount>> {
    return this.transport.request("/v1/connected-accounts", {
      query: {
        userId,
        connectorId: options.connectorId,
        cursor: options.cursor,
        limit: options.limit,
      },
      signal: options.signal,
    });
  }

  get(
    connectedAccountId: string,
    options: RequestOptions & { userId: string },
  ): Promise<ConnectedAccount> {
    return this.transport.request(
      `/v1/connected-accounts/${encodeURIComponent(connectedAccountId)}`,
      {
        query: { userId: options.userId },
        signal: options.signal,
      },
    );
  }

  setDefault(
    connectedAccountId: string,
    userId: string,
    options: RequestOptions = {},
  ): Promise<ConnectedAccount> {
    return this.transport.request(
      `/v1/connected-accounts/${encodeURIComponent(connectedAccountId)}/default`,
      {
        method: "PATCH",
        body: { userId },
        signal: options.signal,
      },
    );
  }

  async delete(
    connectedAccountId: string,
    userId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await this.transport.requestDetailed(
      `/v1/connected-accounts/${encodeURIComponent(connectedAccountId)}`,
      {
        method: "DELETE",
        query: { userId },
        signal: options.signal,
      },
    );
  }
}

interface CatalogCacheEntry {
  etag?: string;
  response: ListResponse<ToolDescriptor> & { catalogVersion: string };
}

export class ToolsResource<Provider extends ToolkitProvider | undefined> {
  private readonly catalogCache = new Map<string, CatalogCacheEntry>();

  constructor(
    private readonly transport: Transport,
    private readonly provider: Provider,
  ) {}

  async list(
    userId: string,
    selection: ToolSelection = {},
    options: RequestOptions = {},
  ): Promise<ListResponse<ToolDescriptor> & { catalogVersion: string }> {
    const query = {
      userId,
      connectors: selection.connectors,
      exposure: selection.exposure,
      read: selection.read ?? "all",
      write: selection.write ?? [],
      connectedAccountIds: selection.connectedAccountIds,
    };
    const cacheKey = JSON.stringify(query);
    const cached = this.catalogCache.get(cacheKey);
    const response = await this.transport.requestDetailed<
      ListResponse<ToolDescriptor> & { catalogVersion: string }
    >("/v1/tools/query", {
      method: "POST",
      body: query,
      headers: cached?.etag ? { "if-none-match": cached.etag } : undefined,
      signal: options.signal,
    });

    if (response.status === 304 && cached) return cached.response;

    if (!response.data) {
      throw new ToolkitError("The Toolkit tool catalog response was empty.", {
        code: "EMPTY_RESPONSE",
        status: response.status,
      });
    }

    this.catalogCache.set(cacheKey, {
      etag: response.headers.get("etag") ?? undefined,
      response: response.data,
    });
    return response.data;
  }

  async get(
    userId: string,
    selection: ToolSelection = {},
    options: RequestOptions = {},
  ): Promise<ProviderOutput<Provider>> {
    const response = await this.list(userId, selection, options);
    if (!this.provider) return response.items as ProviderOutput<Provider>;

    return this.provider.createTools({
      tools: response.items,
      userId,
      connectedAccountIds: selection.connectedAccountIds,
      execute: (toolId, arguments_, connectedAccountId) =>
        this.execute(toolId, {
          userId,
          arguments: arguments_,
          connectedAccountId,
          signal: options.signal,
        }),
    }) as ProviderOutput<Provider>;
  }

  async execute(toolId: string, options: ExecuteToolOptions): Promise<unknown> {
    const response = await this.transport.request<{ result: unknown }>(
      `/v1/tools/${encodeURIComponent(toolId)}/execute`,
      {
        method: "POST",
        body: {
          userId: options.userId,
          arguments: options.arguments,
          connectedAccountId: options.connectedAccountId,
        },
        signal: options.signal,
      },
    );

    return response.result;
  }

  search(
    query: string,
    options: SearchToolsOptions,
  ): Promise<ListResponse<ToolDescriptor>> {
    return this.transport.request("/v1/tools/search", {
      method: "POST",
      body: {
        query,
        userId: options.userId,
        connectors: options.connectors,
        limit: options.limit,
      },
      signal: options.signal,
    });
  }
}

const ROUTER_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    access: "read",
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      readOnlyHint: true,
    },
    connectorId: "toolkit",
    description:
      "Semantically search the Toolkit catalog and return compact ranked tool matches. Use this before requesting schemas.",
    exposure: "core",
    id: "toolkit.router.search",
    inputSchema: {
      additionalProperties: false,
      properties: {
        connectors: { items: { type: "string" }, type: "array" },
        exposure: { enum: ["all", "core", "extended"], type: "string" },
        limit: { maximum: 20, minimum: 1, type: "integer" },
        query: { minLength: 1, type: "string" },
      },
      required: ["query"],
      type: "object",
    },
    name: "toolkitRouterSearch",
    presentation: {
      progressPhrases: ["Searching the Toolkit catalog"],
      title: "Search Toolkit tools",
    },
    requiredScopes: [],
  },
  {
    access: "read",
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    },
    connectorId: "toolkit",
    description:
      "Retrieve code-backed input schemas for up to 20 selected Toolkit tool IDs.",
    exposure: "core",
    id: "toolkit.router.schemas",
    inputSchema: {
      additionalProperties: false,
      properties: {
        toolIds: {
          items: { type: "string" },
          maxItems: 20,
          minItems: 1,
          type: "array",
        },
      },
      required: ["toolIds"],
      type: "object",
    },
    name: "toolkitRouterSchemas",
    presentation: {
      progressPhrases: ["Loading Toolkit tool schemas"],
      title: "Get Toolkit tool schemas",
    },
    requiredScopes: [],
  },
  {
    access: "write",
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    connectorId: "toolkit",
    description:
      "Execute a selected Toolkit tool by ID after inspecting its schema. Project write and destructive policies are enforced by the server.",
    exposure: "core",
    id: "toolkit.router.execute",
    inputSchema: {
      additionalProperties: false,
      properties: {
        arguments: {},
        connectedAccountId: { format: "uuid", type: "string" },
        toolId: { minLength: 1, type: "string" },
      },
      required: ["toolId", "arguments"],
      type: "object",
    },
    name: "toolkitRouterExecute",
    presentation: {
      progressPhrases: ["Executing the selected Toolkit tool"],
      title: "Execute Toolkit tool",
    },
    requiredScopes: [],
  },
];

export class ToolRouterResource<Provider extends ToolkitProvider | undefined> {
  constructor(
    private readonly transport: Transport,
    private readonly tools: ToolsResource<Provider>,
    private readonly provider: Provider,
  ) {}

  async search(
    query: string,
    options: RouterSearchOptions = {},
  ): Promise<ListResponse<ToolRouterMatch>> {
    return this.transport.request("/v1/tool-router/search", {
      body: {
        connectors: options.connectors,
        exposure: options.exposure ?? "core",
        limit: options.limit ?? 6,
        query,
      },
      method: "POST",
      signal: options.signal,
    });
  }

  async schemas(
    toolIds: string[],
    options: RequestOptions = {},
  ): Promise<ListResponse<ToolDescriptor>> {
    if (toolIds.length < 1 || toolIds.length > 20) {
      throw new ToolkitError("toolIds must contain between 1 and 20 tools.", {
        code: "INVALID_TOOL_SELECTION",
      });
    }
    return this.transport.request("/v1/tool-router/schemas", {
      body: { toolIds },
      method: "POST",
      signal: options.signal,
    });
  }

  async execute(toolId: string, options: ExecuteToolOptions): Promise<unknown> {
    const response = await this.transport.request<{ result: unknown }>(
      "/v1/tool-router/execute",
      {
        body: {
          arguments: options.arguments,
          connectedAccountId: options.connectedAccountId,
          toolId,
          userId: options.userId,
        },
        method: "POST",
        signal: options.signal,
      },
    );
    return response.result;
  }

  async get(
    userId: string,
    options: RouterGetOptions = {},
  ): Promise<RouterProviderOutput<Provider>> {
    const preload = [...new Set(options.preload ?? [])];
    if (preload.length > 20) {
      throw new ToolkitError("Router preloads are limited to 20 direct tools.", {
        code: "INVALID_TOOL_SELECTION",
      });
    }
    const direct = preload.length
      ? (await this.schemas(preload, options)).items
      : [];
    const descriptors = [...ROUTER_TOOL_DESCRIPTORS, ...direct];
    if (!this.provider) return descriptors as RouterProviderOutput<Provider>;

    return this.provider.createTools({
      connectedAccountIds: options.connectedAccountIds,
      execute: (toolId, arguments_, connectedAccountId) => {
        const input = arguments_ as Record<string, unknown>;
        if (toolId === "toolkit.router.search") {
          return this.search(String(input.query ?? ""), {
            connectors: Array.isArray(input.connectors)
              ? input.connectors.map(String)
              : options.connectors,
            exposure:
              input.exposure === "all" ||
              input.exposure === "core" ||
              input.exposure === "extended"
                ? input.exposure
                : options.exposure,
            limit: typeof input.limit === "number" ? input.limit : options.limit,
            signal: options.signal,
          });
        }
        if (toolId === "toolkit.router.schemas") {
          return this.schemas(
            Array.isArray(input.toolIds) ? input.toolIds.map(String) : [],
            options,
          );
        }
        if (toolId === "toolkit.router.execute") {
          return this.execute(String(input.toolId ?? ""), {
            arguments: input.arguments,
            connectedAccountId:
              typeof input.connectedAccountId === "string"
                ? input.connectedAccountId
                : connectedAccountId,
            signal: options.signal,
            userId,
          });
        }
        return this.tools.execute(toolId, {
          arguments: arguments_,
          connectedAccountId,
          signal: options.signal,
          userId,
        });
      },
      tools: descriptors,
      userId,
    }) as RouterProviderOutput<Provider>;
  }
}

export class Toolkit<Provider extends ToolkitProvider | undefined = undefined> {
  readonly connectors: ConnectorsResource;
  readonly connectedAccounts: ConnectedAccountsResource;
  readonly router: ToolRouterResource<Provider>;
  readonly tools: ToolsResource<Provider>;

  constructor(options: ToolkitOptions<Provider>) {
    if (!options?.apiKey?.trim()) {
      throw new ToolkitError("apiKey is required.", {
        code: "INVALID_API_KEY",
      });
    }

    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
    ) {
      throw new ToolkitError("timeoutMs must be a positive number.", {
        code: "INVALID_TIMEOUT",
      });
    }

    const transport = new Transport(
      normalizeBaseUrl(options.baseUrl?.trim() || TOOLKIT_API_URL),
      options.apiKey,
      options.fetch,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    this.connectedAccounts = new ConnectedAccountsResource(transport);
    this.connectors = new ConnectorsResource(transport, this.connectedAccounts);
    this.tools = new ToolsResource(transport, options.provider as Provider);
    this.router = new ToolRouterResource(
      transport,
      this.tools,
      options.provider as Provider,
    );
  }
}
