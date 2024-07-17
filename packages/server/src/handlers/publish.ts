import { RequestHandlerArgs } from "@socket-mesh/core";
import { BasicSocketMapServer } from "../maps/socket-map.js";
import { InvalidActionError } from "@socket-mesh/errors";
import { PublishOptions } from "@socket-mesh/channels";
import { ServerSocket } from "../server-socket.js";
import { BasicServerMap } from "../maps/server-map.js";
import { ServerTransport } from "../server-transport.js";

export async function publishHandler(
	{ socket, transport, options }: RequestHandlerArgs<PublishOptions, BasicSocketMapServer<{}, { [channel: string]: any }>, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>
): Promise<void> {
	if (!socket.server.allowClientPublish) {
		throw new InvalidActionError('Client publish feature is disabled');
	}

	if (typeof options.channel !== 'string' || !options.data) {
		throw new InvalidActionError('Publish channel name was malformatted');
	}

	let data = options.data;

	for (const plugin of socket.server.plugins) {
		if (plugin.onPublishIn) {
			data = await plugin.onPublishIn({
				channel: options.channel,
				data,
				socket,
				transport
			});
		}
	}

	await socket.server.exchange.invokePublish(options.channel, data);
}