import { BrokerError, InvalidActionError } from "@socket-mesh/errors";
import { SubscribeOptions } from "@socket-mesh/client";
import { ServerRequestHandlerArgs } from "./server-request-handler.js";

export async function subscribeHandler(
	{ socket, transport, options }: ServerRequestHandlerArgs<SubscribeOptions>
): Promise<void> {
	if (socket.status !== 'ready') {
		// This is an invalid state; it means the client tried to subscribe before
		// having completed the handshake.
		throw new InvalidActionError('Cannot subscribe socket to a channel before it has completed the handshake');
	}

	const state = socket.state;
	const server = socket.server;

	if (server.socketChannelLimit && (state.channelSubscriptionsCount || 0) >= server.socketChannelLimit) {
		throw new InvalidActionError(
			`Socket ${socket.id} tried to exceed the channel subscription limit of ${server.socketChannelLimit}`
		);
	}

	const { channel, ...channelOptions } = options;

	for (const plugin of socket.server.plugins) {
		if (plugin.onSubscribe) {
			await plugin.onSubscribe({ channel, options, socket, transport });
		}
	}

	try {
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