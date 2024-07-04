import { RequestHandlerArgs } from "../../request-handler.js";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { InvalidActionError } from "@socket-mesh/errors";
import { PublishOptions } from "../../channels/channels.js";
import { ServerSocket } from "../server-socket.js";
import { BasicServerMap } from "../../client/maps/server-map.js";
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

	for (const middleware of socket.server.middleware) {
		if (middleware.onPublishIn) {
			data = await middleware.onPublishIn({
				channel: options.channel,
				data,
				socket,
				transport
			});
		}
	}

	await socket.server.exchange.invokePublish(options.channel, data);
}