import { ToolkitError } from "./errors.js";
import type { FetchLike, RequestOptions } from "./types.js";

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface RequestConfig extends RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

export interface DetailedResponse<T> {
  data?: T;
  status: number;
  headers: Headers;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);

  const date = Date.parse(value);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1_000));
}

function createRequestSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; didTimeout: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("Toolkit request timed out"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

export class Transport {
  private readonly fetch: FetchLike;

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    fetchImplementation: FetchLike | undefined,
    private readonly timeoutMs: number,
  ) {
    const runtimeFetch = globalThis.fetch?.bind(globalThis);
    this.fetch = fetchImplementation ?? runtimeFetch;

    if (!this.fetch) {
      throw new ToolkitError("No fetch implementation is available.", {
        code: "FETCH_UNAVAILABLE",
      });
    }
  }

  async request<T>(path: string, config: RequestConfig = {}): Promise<T> {
    const response = await this.requestDetailed<T>(path, config);

    if (response.data === undefined) {
      throw new ToolkitError("The Toolkit API returned an empty response.", {
        code: "EMPTY_RESPONSE",
        status: response.status,
        requestId: response.headers.get("x-request-id") ?? undefined,
      });
    }

    return response.data;
  }

  async requestDetailed<T>(
    path: string,
    config: RequestConfig = {},
  ): Promise<DetailedResponse<T>> {
    const url = new URL(`${this.endpoint}${path}`);
    for (const [name, value] of Object.entries(config.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }

    const requestSignal = createRequestSignal(config.signal, this.timeoutMs);
    let response: Response;

    try {
      response = await this.fetch(url, {
        method: config.method ?? "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.apiKey}`,
          ...(config.body === undefined ? {} : { "content-type": "application/json" }),
          ...config.headers,
        },
        body: config.body === undefined ? undefined : JSON.stringify(config.body),
        signal: requestSignal.signal,
      });
    } catch (error) {
      if (requestSignal.didTimeout()) {
        throw new ToolkitError("The Toolkit API request timed out.", {
          code: "REQUEST_TIMEOUT",
          cause: error,
        });
      }

      if (requestSignal.signal.aborted) {
        throw new ToolkitError("The Toolkit API request was aborted.", {
          code: "REQUEST_ABORTED",
          cause: error,
        });
      }

      throw new ToolkitError("The Toolkit API could not be reached.", {
        code: "NETWORK_ERROR",
        cause: error,
      });
    } finally {
      requestSignal.cleanup();
    }

    if (response.status === 204 || response.status === 304) {
      return { status: response.status, headers: response.headers };
    }

    const responseText = await response.text();
    let responseData: unknown;
    try {
      responseData = responseText ? JSON.parse(responseText) : undefined;
    } catch {
      responseData = undefined;
    }

    if (!response.ok) {
      const envelope = (responseData ?? {}) as ErrorEnvelope;
      throw new ToolkitError(
        envelope.error?.message ??
          `Toolkit API request failed with status ${response.status}.`,
        {
          code: envelope.error?.code ?? "API_ERROR",
          status: response.status,
          details: envelope.error?.details,
          requestId: response.headers.get("x-request-id") ?? undefined,
          retryAfter: parseRetryAfter(response.headers.get("retry-after")),
        },
      );
    }

    return {
      data: responseData as T,
      status: response.status,
      headers: response.headers,
    };
  }
}
