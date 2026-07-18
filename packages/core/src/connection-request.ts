import { ToolkitError } from "./errors.js";
import type { Transport } from "./transport.js";
import type {
  ConnectedAccount,
  ConnectionRequestStatus,
  WaitForConnectionOptions,
} from "./types.js";

export interface ConnectionRequestSnapshot {
  id: string;
  redirectUrl: string;
  status: ConnectionRequestStatus;
  expiresAt: string;
  connectedAccount?: ConnectedAccount;
  failure?: { code: string; message: string };
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    if (signal.aborted) {
      clearTimeout(timer);
      reject(signal.reason);
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class ConnectionRequest {
  readonly id: string;
  readonly redirectUrl: string;
  readonly expiresAt: string;
  status: ConnectionRequestStatus;

  constructor(
    private readonly transport: Transport,
    private snapshot: ConnectionRequestSnapshot,
  ) {
    this.id = snapshot.id;
    this.redirectUrl = snapshot.redirectUrl;
    this.expiresAt = snapshot.expiresAt;
    this.status = snapshot.status;
  }

  async refresh(signal?: AbortSignal): Promise<ConnectionRequestSnapshot> {
    this.snapshot = await this.transport.request<ConnectionRequestSnapshot>(
      `/v1/connection-requests/${encodeURIComponent(this.id)}`,
      { signal },
    );
    this.status = this.snapshot.status;
    return this.snapshot;
  }

  async waitForConnection(
    options: WaitForConnectionOptions = {},
  ): Promise<ConnectedAccount> {
    const expiresIn = Math.max(0, Date.parse(this.expiresAt) - Date.now());
    const timeoutMs = Math.min(options.timeoutMs ?? expiresIn, expiresIn);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("Connection request timed out")),
      timeoutMs,
    );
    const abortFromCaller = () => controller.abort(options.signal?.reason);

    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      while (true) {
        const snapshot = await this.refresh(controller.signal);

        if (snapshot.status === "active" && snapshot.connectedAccount) {
          return snapshot.connectedAccount;
        }

        if (snapshot.status === "failed") {
          throw new ToolkitError(
            snapshot.failure?.message ?? "The connection request failed.",
            {
              code: snapshot.failure?.code ?? "CONNECTION_FAILED",
              details: snapshot.failure,
            },
          );
        }

        if (snapshot.status === "expired") {
          throw new ToolkitError("The connection request expired.", {
            code: "CONNECTION_EXPIRED",
          });
        }

        await delay(
          Math.max(250, options.pollIntervalMs ?? 1_000),
          controller.signal,
        );
      }
    } catch (error) {
      if (error instanceof ToolkitError) throw error;

      throw new ToolkitError(
        options.signal?.aborted
          ? "Waiting for the connection was aborted."
          : "Waiting for the connection timed out.",
        {
          code: options.signal?.aborted
            ? "REQUEST_ABORTED"
            : "CONNECTION_TIMEOUT",
          cause: error,
        },
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
