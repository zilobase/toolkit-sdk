import { ToolkitError } from "@zilobase/toolkit";

import {
  getToolkit,
  getToolkitReturnUrl,
  getToolkitUserId,
  getToolkitWriteTools,
  isToolkitChatConnector,
} from "@/lib/toolkit";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Toolkit request failed.";
  const status = error instanceof ToolkitError && error.status ? error.status : 500;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    const toolkit = getToolkit();
    const userId = getToolkitUserId();
    const [connectors, accounts] = await Promise.all([
      toolkit.connectors.list({ limit: 100 }),
      toolkit.connectedAccounts.list(userId, { limit: 100 }),
    ]);

    return Response.json({
      connectors: connectors.items.filter((connector) =>
        isToolkitChatConnector(connector.id),
      ),
      accounts: accounts.items.filter((account) =>
        isToolkitChatConnector(account.connectorId),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { connectorId?: string };
    const connectorId = body.connectorId?.trim();
    if (!connectorId) {
      return Response.json({ error: "connectorId is required." }, { status: 400 });
    }
    if (!isToolkitChatConnector(connectorId)) {
      return Response.json(
        { error: "Connector is not available in Toolkit Chat." },
        { status: 404 },
      );
    }

    const connection = await getToolkit().connectors.authorize(
      getToolkitUserId(),
      connectorId,
      {
        returnUrl: getToolkitReturnUrl(request.url),
        read: "all",
        write: getToolkitWriteTools(connectorId),
      },
    );

    return Response.json({
      id: connection.id,
      redirectUrl: connection.redirectUrl,
      expiresAt: connection.expiresAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const accountId = new URL(request.url).searchParams.get("accountId")?.trim();
    if (!accountId) {
      return Response.json({ error: "accountId is required." }, { status: 400 });
    }

    await getToolkit().connectedAccounts.delete(accountId, getToolkitUserId());
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
