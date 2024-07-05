import { BasicSocketMapServer } from "../maps/socket-map.js";
import { SocketTransport } from "@socket-mesh/client/core";

export async function deauthenticate(
	transport: SocketTransport<BasicSocketMapServer>
): Promise<boolean> {
	if (await transport.changeToUnauthenticatedState()) {
		await transport.transmit('#removeAuthToken');
		return true;
	}

	return false;
}