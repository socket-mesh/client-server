import { ChannelOptions } from "../channels/channel-options.js";
import { ChannelState } from "../channels/channel-state.js";
import { ClientTransport } from "./client-transport.js";
import { SubscribeStateChangeEvent } from "../channels/channel-events.js";
import { ClientMap } from "./maps/client-map.js";
import { ChannelDetails, Channels, ChannelsOptions } from "../channels/channels.js";

export interface ClientChannelsOptions extends ChannelsOptions {
	autoSubscribeOnConnect?: boolean
}

export class ClientChannels<T extends ClientMap> extends Channels<T['Channel']> {
	public autoSubscribeOnConnect: boolean;

	protected readonly _transport: ClientTransport<T>;
	protected _preparingPendingSubscriptions: boolean;

	constructor(transport: ClientTransport<T>, options?: ClientChannelsOptions) {
		if (!options) {
			options = {};
		}

		super(options);

		this.autoSubscribeOnConnect = options.autoSubscribeOnConnect ?? true;
		this._transport = transport;
		this._preparingPendingSubscriptions = false;

		this._transport.middleware.push({
			type: 'channels',
			onAuthenticate: () => {
				if (!this._preparingPendingSubscriptions) {
					this.processPendingSubscriptions();
				}	
			},
			onOpen: () => {
				if (this.autoSubscribeOnConnect) {
					this.processPendingSubscriptions();
				}		
			},
			onClose: () => {
				this.suspendSubscriptions();
			},
		});
	}

	private suspendSubscriptions(): void {
		for (const channel in this._channelMap) {
			this.triggerChannelUnsubscribe(this._channelMap[channel], true);
		}
	}

	protected trySubscribe(channel: ChannelDetails): void {
		const meetsAuthRequirements = !channel.options.waitForAuth || !!this._transport.signedAuthToken;

		// We can only ever have one pending subscribe action at any given time on a channel
		if (
			this._transport.status === 'open' &&
			!this._preparingPendingSubscriptions &&
			!channel.subscribePromise &&
			meetsAuthRequirements
		) {
			const subscriptionOptions: ChannelOptions = {};

			if (channel.options.waitForAuth) {
				subscriptionOptions.waitForAuth = true;
			}
			if (channel.options.data) {
				subscriptionOptions.data = channel.options.data;
			}

			[channel.subscribePromise, channel.subscribeAbort] = this._transport.invoke(
				{ method: '#subscribe', ackTimeoutMs: false },
				{
					channel: this.decorateChannelName(channel.name),
					...subscriptionOptions
				}
			) as [Promise<void>, () => void];

			channel.subscribePromise.then(() => {
				delete channel.subscribePromise;
				delete channel.subscribeAbort;
				this.triggerChannelSubscribe(channel, subscriptionOptions);
			}).catch(err => {
				if (err.name === 'BadConnectionError') {
					// In case of a failed connection, keep the subscription
					// as pending; it will try again on reconnect.
					return;
				}

				if (err.name !== 'AbortError') {
					this.triggerChannelSubscribeFail(err, channel, subscriptionOptions);
				}
				delete channel.subscribePromise;
				delete channel.subscribeAbort;
			});

			this.emit('subscribeRequest', {
				channel: channel.name,
				options: subscriptionOptions
			});
		}
	}

	private processPendingSubscriptions(): void {
		this._preparingPendingSubscriptions = false;
		const pendingChannels: ChannelDetails[] = [];

		Object.keys(this._channelMap).forEach((channelName) => {
			const channel = this._channelMap[channelName];
			if (channel.state === 'pending') {
				pendingChannels.push(channel);
			}
		});

		pendingChannels.sort((a, b) => {
			const ap = a.options.priority || 0;
			const bp = b.options.priority || 0;
			if (ap > bp) {
				return -1;
			}
			if (ap < bp) {
				return 1;
			}
			return 0;
		});

		pendingChannels.forEach((channel) => {
			this.trySubscribe(channel);
		});
	}

	unsubscribe(channelName: keyof T['Channel'] & string | string): void {
		const channel = this._channelMap[channelName];

		if (channel) {
			this.tryUnsubscribe(channel);
		}
	}

	protected tryUnsubscribe(channel: ChannelDetails): void {
		this.triggerChannelUnsubscribe(channel);

		if (this._transport.status === 'open') {
			// If there is a pending subscribe action, cancel the callback
			this.cancelPendingSubscribeCallback(channel);

			// This operation cannot fail because the TCP protocol guarantees delivery
			// so long as the connection remains open. If the connection closes,
			// the server will automatically unsubscribe the client and thus complete
			// the operation on the server side.
			const decoratedChannelName = this.decorateChannelName(channel.name);
			this._transport.transmit('#unsubscribe', decoratedChannelName);
		}
	}

	private triggerChannelSubscribe(channel: ChannelDetails, options: ChannelOptions): void {
		const channelName = channel.name;

		if (channel.state !== 'subscribed') {
			const oldState = channel.state;
			channel.state = 'subscribed';

			const stateChangeData: SubscribeStateChangeEvent = {
				channel: channel.name,
				oldState,
				newState: channel.state,
				options
			};
			this._channelEventDemux.write(`${channelName}/subscribeStateChange`, stateChangeData);
			this._channelEventDemux.write(`${channelName}/subscribe`, { channel: channel.name, options });
			this.emit('subscribeStateChange', {
				channel: channelName,
				...stateChangeData
			});
			this.emit('subscribe', {
				channel: channelName,
				options
			});
		}
	}

	private triggerChannelSubscribeFail(err: Error, channel: ChannelDetails, options: ChannelOptions): void {
		const meetsAuthRequirements = !channel.options.waitForAuth || !!this._transport.signedAuthToken;
		const hasChannel = !!this._channelMap[channel.name];

		if (hasChannel && meetsAuthRequirements) {
			delete this._channelMap[channel.name];

			this._channelEventDemux.write(`${channel.name}/subscribeFail`, {
				channel: channel.name,
				error: err,
				options
			});
			this.emit('subscribeFail', {
				error: err,
				channel: channel.name,
				options
			});
		}
	}

	private triggerChannelUnsubscribe(channel: ChannelDetails, setAsPending?: boolean): void {
		const channelName = channel.name;

		this.cancelPendingSubscribeCallback(channel);

		if (channel.state === 'subscribed') {
			const stateChangeData: SubscribeStateChangeEvent = {
				channel: channel.name,
				oldState: channel.state as ChannelState,
				newState: setAsPending ? 'pending' : 'unsubscribed',
				options: channel.options
			};
			this._channelEventDemux.write(`${channelName}/subscribeStateChange`, stateChangeData);
			this._channelEventDemux.write(`${channelName}/unsubscribe`, { channel: channel.name });
			this.emit('subscribeStateChange', {
				channel: channelName,
				...stateChangeData
			});
			this.emit('unsubscribe', { channel: channelName });
		}

		if (setAsPending) {
			channel.state = 'pending';
		} else {
			delete this._channelMap[channelName];
		}
	}

	// Cancel any pending subscribe callback
	private cancelPendingSubscribeCallback(channel: ChannelDetails): void {
		if (channel.subscribeAbort) {
			channel.subscribeAbort();
		}
	}

	transmitPublish<U extends keyof T['Channel'] & string>(channelName: U, data: T['Channel'][U]): Promise<void>;
	transmitPublish<U>(channelName: string, data: U): Promise<void>;
	transmitPublish<U>(channelName: keyof T['Channel'] & string | string, data: U): Promise<void> {
		const pubData = {
			channel: this.decorateChannelName(channelName),
			data
		};
		return this._transport.transmit('#publish', pubData);
	}

	invokePublish<U extends keyof T['Channel'] & string>(channelName: keyof T['Channel'] & string, data: T['Channel'][U]): Promise<void>
	invokePublish<U>(channelName: string, data: U): Promise<void>;
	invokePublish<U>(channelName: keyof T['Channel'] & string | string, data: U): Promise<void> {
		const pubData = {
			channel: this.decorateChannelName(channelName),
			data
		};

		return this._transport.invoke('#publish', pubData)[0] as Promise<void>;
	}
}