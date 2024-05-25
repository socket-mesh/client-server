import { RequestHandlerArgs } from "../../request-handler.js";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { BrokerError, InvalidActionError } from "@socket-mesh/errors";

export async function unsubscribeHandler(
	{ socket, transport, options: channel }: RequestHandlerArgs<string, BasicSocketMapServer>
): Promise<void> {
	const state = transport.state;

	if (typeof channel !== 'string') {
		throw new InvalidActionError(
			`Socket ${socket.id} tried to unsubscribe from an invalid channel name`
		);
	}

	if (!state.channelSubscriptions?.[channel]) {
		throw new InvalidActionError(
			`Socket ${socket.id} tried to unsubscribe from a channel which it is not subscribed to`
		);
	}

	try {
		const server = state.server;

		server.brokerEngine.unsubscribeSocket(this, channel);
		delete state.channelSubscriptions[channel];

		if (state.channelSubscriptionsCount != null) {
			state.channelSubscriptionsCount--;
		}

		socket.emit('unsubscribe', { channel });
	} catch (err) {
		throw new BrokerError(`Failed to unsubscribe socket from the ${channel} channel - ${err}`);
	}
}