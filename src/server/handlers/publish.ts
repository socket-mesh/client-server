import { RequestHandlerArgs } from "../../request-handler.js";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { InvalidActionError } from "@socket-mesh/errors";
import { PublishOptions } from "../../channels/channels.js";

export async function publishHandler(
	{ transport, options }: RequestHandlerArgs<PublishOptions, BasicSocketMapServer<{}, { [channel: string]: any }>>
): Promise<void> {
	const state = transport.state;
	const server = state.server;

	if (!server.allowClientPublish) {
		throw new InvalidActionError('Client publish feature is disabled');
	}

	if (typeof options.channel !== 'string' || !options.data) {
		throw new InvalidActionError('Publish channel name was malformatted');
	}

	await server.exchange.invokePublish(options.channel, options.data);
}