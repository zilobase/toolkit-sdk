"use client";

import {
  CheckCircle2,
  LoaderCircle,
  LogOut,
  Plug,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Connector = {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
};

type ConnectedAccount = {
  id: string;
  connectorId: string;
  status: "active" | "expired" | "revoked";
};

type IntegrationResponse = {
  connectors: Connector[];
  accounts: ConnectedAccount[];
  error?: string;
};

type IntegrationsPanelProps = {
  open: boolean;
  onClose: () => void;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

export function IntegrationsPanel({ open, onClose }: IntegrationsPanelProps) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [pendingConnector, setPendingConnector] = useState<string>();
  const [disconnecting, setDisconnecting] = useState<string>();
  const pollRef = useRef<number>();
  const popupRef = useRef<Window | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(undefined);

    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      const data = await readJson<IntegrationResponse>(response);
      setConnectors(data.connectors);
      setAccounts(data.accounts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAccounts = useMemo(
    () => new Map(accounts.filter((account) => account.status === "active").map((account) => [account.connectorId, account])),
    [accounts],
  );

  async function connect(connectorId: string) {
    const popup = window.open(
      "about:blank",
      "toolkit-connect",
      "popup,width=560,height=720",
    );
    popupRef.current = popup;
    let popupNavigated = false;
    setPendingConnector(connectorId);
    setError(undefined);

    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectorId }),
      });
      const data = await readJson<{ redirectUrl: string }>(response);

      if (popup && !popup.closed) {
        popup.location.href = data.redirectUrl;
        popupNavigated = true;
        popup.focus();
      } else {
        window.location.href = data.redirectUrl;
      }

      const startedAt = Date.now();
      window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        await load(true);
        if (Date.now() - startedAt > 120_000) {
          window.clearInterval(pollRef.current);
          setPendingConnector(undefined);
        }
      }, 2_000);
    } catch (connectError) {
      if (!popupNavigated) popup?.close();
      popupRef.current = null;
      setError(connectError instanceof Error ? connectError.message : "Could not start authorization.");
      setPendingConnector(undefined);
    }
  }

  useEffect(() => {
    if (pendingConnector && activeAccounts.has(pendingConnector)) {
      window.clearInterval(pollRef.current);
      popupRef.current = null;
      setPendingConnector(undefined);
    }
  }, [activeAccounts, pendingConnector]);

  useEffect(() => () => window.clearInterval(pollRef.current), []);

  async function disconnect(account: ConnectedAccount) {
    setDisconnecting(account.id);
    setError(undefined);
    try {
      const response = await fetch(
        `/api/integrations?accountId=${encodeURIComponent(account.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Could not disconnect account.");
      }
      await load(true);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Could not disconnect account.");
    } finally {
      setDisconnecting(undefined);
    }
  }

  return (
    <aside className={`integrations-panel ${open ? "integrations-panel-open" : ""}`}>
      <div className="integrations-header">
        <div>
          <p className="section-label">Workspace</p>
          <h2>Integrations</h2>
        </div>
        <button className="icon-button mobile-only" type="button" onClick={onClose} aria-label="Close integrations" title="Close integrations">
          <X size={18} />
        </button>
      </div>

      <div className="integration-summary">
        <span>{activeAccounts.size} connected</span>
        <button className="icon-button" type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh integrations" title="Refresh integrations">
          <RefreshCw size={15} className={loading ? "spin" : ""} />
        </button>
      </div>

      {error ? <div className="panel-error">{error}</div> : null}

      <div className="integration-list" aria-busy={loading}>
        {loading && connectors.length === 0 ? (
          <div className="panel-loading"><LoaderCircle className="spin" size={18} /> Loading integrations</div>
        ) : null}

        {connectors.map((connector) => {
          const account = activeAccounts.get(connector.id);
          const pending = pendingConnector === connector.id;
          return (
            <div className="integration-row" key={connector.id}>
              <div className="connector-mark" aria-hidden="true">
                {connector.logoUrl ? <img src={connector.logoUrl} alt="" /> : connector.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="connector-copy">
                <div className="connector-name">
                  <span>{connector.name}</span>
                  {account ? <CheckCircle2 size={14} aria-label="Connected" /> : null}
                </div>
                <p>{account ? "Ready for chat" : connector.description}</p>
              </div>
              {account ? (
                <button className="icon-button danger" type="button" onClick={() => void disconnect(account)} disabled={disconnecting === account.id} aria-label={`Disconnect ${connector.name}`} title={`Disconnect ${connector.name}`}>
                  {disconnecting === account.id ? <LoaderCircle className="spin" size={16} /> : <LogOut size={16} />}
                </button>
              ) : (
                <button className="icon-button" type="button" onClick={() => void connect(connector.id)} disabled={pending} aria-label={`Connect ${connector.name}`} title={`Connect ${connector.name}`}>
                  {pending ? <LoaderCircle className="spin" size={16} /> : <Plug size={16} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
