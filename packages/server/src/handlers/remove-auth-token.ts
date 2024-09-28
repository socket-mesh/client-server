import { ClientPrivateMap, ServerPrivateMap } from "@socket-mesh/client";
import { SocketTransport } from "@socket-mesh/core";
import { ServerSocketState } from "../server-socket-state.js";

export async function deauthenticate(
	transport: SocketTransport<ServerPrivateMap, {}, ClientPrivateMap, {}, ServerSocketState>
): Promise<boolean> {
	if (await transport.changeToUnauthenticatedState()) {
		await transport.transmit('#removeAuthToken');
		return true;
	}

	return false;
}