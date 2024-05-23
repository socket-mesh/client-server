import { ChannelOptions } from "./channel-options.js";
import { ChannelState, ChannelStateChange } from "./channel-state.js";
import { StreamDemux, StreamDemuxWrapper } from "@socket-mesh/stream-demux";
import { ChannelsListeners } from "./channels-listeners.js";
import { Channel } from "./channel.js";
import { ClientTransport } from "../client-transport.js";
import { MethodMap, PublicMethodMap, ServiceMap } from "../maps/method-map.js";
import { ServerPrivateMap } from "../maps/server-private-map.js";
import { AbortablePromise } from "../../utils.js";
import { ChannelMap } from "./channel-map.js";
import { ChannelEvent, ChannelSubscribeStateChangeEvent } from "./channel-events.js";
import { ClientPrivateMap } from "../maps/client-private-map.js";

interface ChannelDetails {
	name: string,
	state: ChannelState,
	options: ChannelOptions,
	subscribePromise?: AbortablePromise<void>
}

export interface ChannelsOptions {
	autoSubscribeOnConnect?: boolean,
	channelPrefix?: string
}

export class Channels<
	TChannelMap extends ChannelMap<TChannelMap>,
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap & ServerPrivateMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object
> {
	public autoSubscribeOnConnect: boolean;
	public readonly channelPrefix?: string;
	public readonly output: StreamDemuxWrapper<TChannelMap[keyof TChannelMap & string]>;
	public readonly listeners: ChannelsListeners<TChannelMap>;

	protected readonly _transport: ClientTransport<TIncomingMap & ClientPrivateMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap & ServerPrivateMap, TSocketState>;
	protected readonly _channelEventDemux: StreamDemux<ChannelEvent>;
	protected readonly _channelDataDemux: StreamDemux<TChannelMap[keyof TChannelMap & string]>;
	protected readonly _channelMap: { [channelName: string]: ChannelDetails };
	protected _preparingPendingSubscriptions: boolean;

	constructor(
		transport: ClientTransport<TIncomingMap & ClientPrivateMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap & ServerPrivateMap, TSocketState>,
		options?: ChannelsOptions
	) {
		if (!options) {
			options = {};
		}

		this.autoSubscribeOnConnect = options.autoSubscribeOnConnect ?? true;
		this.channelPrefix = options.channelPrefix;
		this._channelMap = {};
		this._channelEventDemux = new StreamDemux<ChannelEvent>();
		this.listeners = new ChannelsListeners(this._channelEventDemux);
		this._channelDataDemux = new StreamDemux<TChannelMap[keyof TChannelMap & string]>();
		this.output = new StreamDemuxWrapper<TChannelMap[keyof TChannelMap & string]>(this._channelDataDemux);
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
			}
		});
	}

	close(channelName?: keyof TChannelMap & string | string): void {
		this.output.close(channelName);
		this.listeners.close(channelName);
	}

	kill(channelName?: keyof TChannelMap & string | string): void {
		this.output.kill(channelName);
		this.listeners.kill(channelName);
	}

	getBackpressure(channelName?: keyof TChannelMap & string | string): number {
		return Math.max(
			this.output.getBackpressure(channelName),
			this.listeners.getBackpressure(channelName)
		);
	}

	getState(channelName: keyof TChannelMap & string | string): ChannelState {
		const channel = this._channelMap[channelName];

		if (channel) {
			return channel.state;
		}

		return ChannelState.UNSUBSCRIBED;
	}

	getOptions(channelName: keyof TChannelMap & string | string): ChannelOptions {
		const channel = this._channelMap[channelName];

		if (channel) {
			return { ...channel.options };
		}
		return {};
	}

	subscribe<T extends keyof TChannelMap & string>(channelName: T, options?: ChannelOptions): Channel<TChannelMap, TChannelMap[T], TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	subscribe<T>(channelName: string, options?: ChannelOptions): Channel<TChannelMap, T, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	subscribe<T>(channelName: string, options?: ChannelOptions): Channel<TChannelMap, T, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState> {
		options = options || {};
		let channel = this._channelMap[channelName];

		const sanitizedOptions: ChannelOptions = {
			waitForAuth: !!options.waitForAuth
		};

		if (options.priority != null) {
			sanitizedOptions.priority = options.priority;
		}
		if (options.data !== undefined) {
			sanitizedOptions.data = options.data;
		}

		if (!channel) {
			channel = {
				name: channelName,
				state: ChannelState.PENDING,
				options: sanitizedOptions
			};
			this._channelMap[channelName] = channel;
			this.trySubscribe(channel);
		} else if (options) {
			channel.options = sanitizedOptions;
		}

		const channelIterable = new Channel<TChannelMap, T, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>(
			channelName,
			this,
			this._channelEventDemux,
			this._channelDataDemux
		);

		return channelIterable;
	}

	protected trySubscribe(channel: ChannelDetails): void {
		const meetsAuthRequirements = !channel.options.waitForAuth || !!this._transport.signedAuthToken;

		// We can only ever have one pending subscribe action at any given time on a channel
		if (
			this._transport.status === 'open' &&
			!this._preparingPendingSubscriptions &&
			channel.subscribePromise &&
			meetsAuthRequirements
		) {
			const subscriptionOptions: ChannelOptions = {};

			if (channel.options.waitForAuth) {
				subscriptionOptions.waitForAuth = true;
			}
			if (channel.options.data) {
				subscriptionOptions.data = channel.options.data;
			}

			channel.subscribePromise = this._transport.invoke(
				{ method: '#subscribe', ackTimeoutMs: false },
				{
					channel: this.decorateChannelName(channel.name),
					...subscriptionOptions
				}
			) as AbortablePromise<void>;
			
			channel.subscribePromise.then(() => {
				delete channel.subscribePromise;
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
			});

			this._transport.socket.emit('subscribeRequest', {
				channel: channel.name,
				options: subscriptionOptions
			});
		}
	}

	channel<T extends keyof TChannelMap & string>(channelName: T): Channel<TChannelMap, TChannelMap[T], TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	channel<T>(channelName: string): Channel<TChannelMap, T, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	channel<T>(channelName: string): Channel<TChannelMap, T, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState> {
		const currentChannel = this._channelMap[channelName];

		return new Channel<TChannelMap, T, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>(
			channelName,
			this,
			this._channelEventDemux,
			this._channelDataDemux
		);
	}

	private decorateChannelName(channelName: keyof TChannelMap & string | string): string {
		return `${this.channelPrefix || ''}${channelName}`;
	}

	processPendingSubscriptions(): void {
		this._preparingPendingSubscriptions = false;
		const pendingChannels: ChannelDetails[] = [];

		Object.keys(this._channelMap).forEach((channelName) => {
			const channel = this._channelMap[channelName];
			if (channel.state === ChannelState.PENDING) {
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

	unsubscribe(channelName: keyof TChannelMap & string | string): void {
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

		if (channel.state !== ChannelState.SUBSCRIBED) {
			const oldState = channel.state;
			channel.state = ChannelState.SUBSCRIBED;

			const stateChangeData: ChannelSubscribeStateChangeEvent = {
				oldState,
				newState: channel.state,
				options
			};
			this._channelEventDemux.write(`${channelName}/subscribeStateChange`, stateChangeData);
			this._channelEventDemux.write(`${channelName}/subscribe`, { options });
			this._transport.socket.emit('subscribeStateChange', {
				channel: channelName,
				...stateChangeData
			});
			this._transport.socket.emit('subscribe', {
				channel: channelName,
				options
			});
		}
	}

	private triggerChannelSubscribeFail(err: Error, channel: ChannelDetails, options: ChannelOptions): void {
		let channelName = channel.name;
		let meetsAuthRequirements = !channel.options.waitForAuth || !!this._transport.signedAuthToken;
		let hasChannel = !!this._channelMap[channelName];

		if (hasChannel && meetsAuthRequirements) {
			delete this._channelMap[channelName];

			this._channelEventDemux.write(`${channelName}/subscribeFail`, {
				error: err,
				options
			});
			this._transport.socket.emit('subscribeFail', {
				error: err,
				channel: channelName,
				options
			});
		}
	}

	private triggerChannelUnsubscribe(channel: ChannelDetails, setAsPending?: boolean): void {
		const channelName = channel.name;

		this.cancelPendingSubscribeCallback(channel);

		if (channel.state === ChannelState.SUBSCRIBED) {
			const stateChangeData: ChannelStateChange = {
				oldState: channel.state as ChannelState,
				newState: setAsPending ? ChannelState.PENDING : ChannelState.UNSUBSCRIBED
			};
			this._channelEventDemux.write(`${channelName}/subscribeStateChange`, stateChangeData);
			this._channelEventDemux.write(`${channelName}/unsubscribe`, {});
			this._transport.socket.emit('subscribeStateChange', {
				channel: channelName,
				...stateChangeData
			});
			this._transport.socket.emit('unsubscribe', { channel: channelName });
		}

		if (setAsPending) {
			channel.state = ChannelState.PENDING;
		} else {
			delete this._channelMap[channelName];
		}
	}

	// Cancel any pending subscribe callback
	private cancelPendingSubscribeCallback(channel: ChannelDetails): void {
		if (channel.subscribePromise) {
			channel.subscribePromise.abort();
		}
	}

	subscriptions(includePending?: boolean): string[] {
		const subs: string[] = [];

		Object.keys(this._channelMap).forEach((channelName) => {
			if (includePending || this._channelMap[channelName].state === ChannelState.SUBSCRIBED) {
				subs.push(channelName);
			}
		});
		return subs;
	}

	isSubscribed(channelName: keyof TChannelMap & string | string, includePending?: boolean): boolean {
		const channel = this._channelMap[channelName];

		if (includePending) {
			return !!channel;
		}
		return !!channel && channel.state === ChannelState.SUBSCRIBED;
	}

	transmitPublish(channelName: keyof TChannelMap & string | string, data: any): Promise<void> {
		const pubData = {
			channel: this.decorateChannelName(channelName),
			data
		};
		return this._transport.transmit('#publish', pubData);
	}

	invokePublish<T>(channelName: keyof TChannelMap & string | string, data: T): AbortablePromise<void> {
		const pubData = {
			channel: this.decorateChannelName(channelName),
			data
		};

		return this._transport.invoke('#publish', pubData) as AbortablePromise<void>;
	}
}