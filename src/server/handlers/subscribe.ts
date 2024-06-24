import { BrokerError, InvalidActionError } from "@socket-mesh/errors";
import { SubscribeOptions } from "../../client/maps/server-map.js";
import { RequestHandlerArgs } from "../../request-handler.js";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";

export async function subscribeHandler(
	{ socket, transport, options }: RequestHandlerArgs<SubscribeOptions, BasicSocketMapServer>
): Promise<void> {
	if (socket.status !== 'ready') {
		// This is an invalid state; it means the client tried to subscribe before
		// having completed the handshake.
		throw new InvalidActionError('Cannot subscribe socket to a channel before it has completed the handshake');
	}

	const state = transport.state;
	const server = state.server;

	if (server.socketChannelLimit && state.channelSubscriptionsCount >= server.socketChannelLimit) {
		throw new InvalidActionError(
			`Socket ${socket.id} tried to exceed the channel subscription limit of ${server.socketChannelLimit}`
		);
	}

	try {
		const { channel, ...channelOptions } = options;

		if (state.channelSubscriptions == null) {
			state.channelSubscriptions = {};
		}
	
		if (state.channelSubscriptionsCount == null) {
			state.channelSubscriptionsCount = 0;
		}

		if (state.channelSubscriptions[channel] == null) {
			state.channelSubscriptions[channel] = true;
			state.channelSubscriptionsCount++;
		}

		try {
			await server.brokerEngine.subscribe(transport, channel);
		} catch (error) {
			delete state.channelSubscriptions[channel];
			state.channelSubscriptionsCount--;
			throw error;
		}
		
		server.exchange.emit('subscribe', { channel, options: channelOptions });
	} catch (err) {
		throw new BrokerError(`Failed to subscribe socket to the ${options.channel} channel - ${err}`);
	}
}