import { ClientPrivateMap } from "../../client/maps/client-private-map";
import { SocketTransport } from "../../socket-transport";

export async function deauthenticate(
	transport: SocketTransport<{}, {}, {}, ClientPrivateMap, {}>
): Promise<boolean> {
	if (await transport.deauthenticate()) {
		await transport.transmit('#removeAuthToken');
		return true;
	}

	return false;
}