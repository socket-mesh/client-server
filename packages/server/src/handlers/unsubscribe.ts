import { RequestHandlerArgs } from "@socket-mesh/core";
import { BrokerError } from "@socket-mesh/errors";
import { ServerSocket } from "../server-socket.js";
import { ServerTransport } from "../server-transport.js";
import { ClientPrivateMap, ServerPrivateMap } from "@socket-mesh/client";
import { ServerSocketState } from "../server-socket-state.js";

export async function unsubscribeHandler(
	{ transport, options: channel }:
		RequestHandlerArgs<
			string,
			ServerPrivateMap,
			{},
			ClientPrivateMap,
			{},
			ServerSocketState,
			ServerSocket,
			ServerTransport
		>
): Promise<void> {
	try {
		await transport.unsubscribe(channel);
	} catch (err) {
		throw new BrokerError(
			`Failed to unsubscribe socket from the ${channel} channel - ${err}`
		);
	}
}