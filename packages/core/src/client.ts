import { ToolkitError } from "./errors.js";
import { Transport } from "./transport.js";
import type {
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
  constructor(private readonly transport: Transport) {}

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
}

export class Toolkit<Provider extends ToolkitProvider | undefined = undefined> {
  readonly connectors: ConnectorsResource;

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

    this.connectors = new ConnectorsResource(transport);
  }
}
