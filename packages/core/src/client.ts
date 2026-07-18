import { ConnectionRequest, type ConnectionRequestSnapshot } from "./connection-request.js";
import { ToolkitError } from "./errors.js";
import { Transport } from "./transport.js";
import type {
  AuthorizeOptions,
  ConnectedAccount,
  Connector,
  ListResponse,
  PaginationOptions,
  RequestOptions,
  ToolkitOptions,
  ToolkitProvider,
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
          redirectUrl: options.redirectUrl,
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

export class Toolkit<Provider extends ToolkitProvider | undefined = undefined> {
  readonly connectors: ConnectorsResource;
  readonly connectedAccounts: ConnectedAccountsResource;

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
  }
}
