import { RequestHandlerArgs } from "@socket-mesh/core";
import { ClientSocket } from "../client-socket.js";
import { ClientTransport } from "../client-transport.js";
import { ClientMap, KickOutOptions } from "../maps/client-map.js";
import { BasicSocketMapClient } from "../maps/socket-map.js";

export async function kickOutHandler(
	{ socket, options }: RequestHandlerArgs<KickOutOptions, BasicSocketMapClient, ClientSocket<ClientMap>, ClientTransport<ClientMap>>
): Promise<void> {
	if (typeof options.channel !== 'string') return;

	socket.channels.kickOut(options.channel, options.message);
}