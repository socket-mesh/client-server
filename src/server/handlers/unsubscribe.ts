import { RequestHandlerArgs } from "../../request-handler.js";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { BrokerError } from "@socket-mesh/errors";
import { ServerSocket } from "../server-socket.js";
import { BasicServerMap } from "../../client/maps/server-map.js";
import { ServerTransport } from "../server-transport.js";

export async function unsubscribeHandler(
	{ transport, options: channel }: RequestHandlerArgs<string, BasicSocketMapServer, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>
): Promise<void> {
	try {
		await transport.unsubscribe(channel);
	} catch (err) {
		throw new BrokerError(
			`Failed to unsubscribe socket from the ${channel} channel - ${err}`
		);
	}
}