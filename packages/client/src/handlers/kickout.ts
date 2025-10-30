import { RequestHandlerArgs } from "@socket-mesh/core";
import { ClientSocket } from "../client-socket.js";
import { ClientTransport } from "../client-transport.js";
import { ClientPrivateMap, KickOutOptions } from "../maps/client-map.js";
import { ServerPrivateMap } from "../maps/server-map.js";
import { ChannelMap } from "@socket-mesh/channels";

export async function kickOutHandler(
	{ socket, options }: RequestHandlerArgs<
		KickOutOptions,
		ClientPrivateMap,
		{},
		ServerPrivateMap,
		{},
		{},
		ClientSocket<{}, ChannelMap>,
		ClientTransport<{}, {}, {}, {}, {}>
	>
): Promise<void> {
	if (typeof options?.channel !== 'string') return;

	socket.channels.kickOut(options.channel, options.message);
}