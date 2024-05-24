import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { SocketTransport } from "../../socket-transport.js";

export async function deauthenticate(
	transport: SocketTransport<BasicSocketMapServer>
): Promise<boolean> {
	if (await transport.deauthenticate()) {
		await transport.transmit('#removeAuthToken');
		return true;
	}

	return false;
}