import { RequestHandlerArgs } from "../../request-handler.js";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { InvalidActionError } from "@socket-mesh/errors";
import { PublishOptions } from "../../channels/channels.js";
import { ServerSocket } from "../server-socket.js";
import { BasicServerMap } from "../../client/maps/server-map.js";

export async function publishHandler(
	{ socket, options }: RequestHandlerArgs<PublishOptions, BasicSocketMapServer<{}, { [channel: string]: any }>, ServerSocket<BasicServerMap>>
): Promise<void> {
	if (!socket.server.allowClientPublish) {
		throw new InvalidActionError('Client publish feature is disabled');
	}

	if (typeof options.channel !== 'string' || !options.data) {
		throw new InvalidActionError('Publish channel name was malformatted');
	}

	await socket.server.exchange.invokePublish(options.channel, options.data);
}