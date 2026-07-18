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
  SearchToolsOptions,
  ToolkitOptions,
  ToolkitProvider,
  ToolDescriptor,
  ToolSelection,
} from "./types.js";

const DEFAULT_BASE_URL = "https://toolkit.notelab.io/api/toolkit";
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeBaseUrl(value: string): string {
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

export class Toolkit<Provider extends ToolkitProvider | undefined = undefined> {
  readonly connectors: ConnectorsResource;
  readonly connectedAccounts: ConnectedAccountsResource;
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
      normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL),
      options.apiKey,
      options.fetch,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    this.connectedAccounts = new ConnectedAccountsResource(transport);
    this.connectors = new ConnectorsResource(transport, this.connectedAccounts);
    this.tools = new ToolsResource(transport, options.provider as Provider);
  }
}
