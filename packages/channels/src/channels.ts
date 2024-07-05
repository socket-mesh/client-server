import { ChannelOptions } from "./channel-options.js";
import { ChannelState } from "./channel-state.js";
import { DemuxedConsumableStream, StreamDemux, StreamDemuxWrapper, StreamEvent } from "@socket-mesh/stream-demux";
import { ChannelsListeners } from "./channels-listeners.js";
import { Channel } from "./channel.js";
import { ChannelEvent, KickOutEvent, SubscribeEvent, SubscribeFailEvent, SubscribeStateChangeEvent, UnsubscribeEvent } from "./channel-events.js";
import { ChannelMap } from "./channel-map.js";
import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";

export interface ChannelDetails {
	name: string,
	state: ChannelState,
	options: ChannelOptions,
	subscribePromise?: Promise<void>,
	subscribeAbort?: () => void
}

export interface ChannelsOptions {
	channelPrefix?: string
}

export interface PublishOptions {
	channel: string,
	data: any
}

export function isPublishOptions(options: unknown): options is PublishOptions {
	return !!options && typeof options === 'object' && 'channel' in options && typeof options.channel === 'string';
}

export abstract class Channels<T extends ChannelMap> extends AsyncStreamEmitter<ChannelEvent> {
	public readonly channelPrefix?: string;
	public readonly output: StreamDemuxWrapper<T[keyof T & string]>;
	public readonly listeners: ChannelsListeners<T>;

	protected readonly _channelEventDemux: StreamDemux<ChannelEvent>;
	protected readonly _channelDataDemux: StreamDemux<T[keyof T & string]>;
	protected readonly _channelMap: { [channelName: string]: ChannelDetails };

	constructor(options?: ChannelsOptions) {
		super();

		if (!options) {
			options = {};
		}

		this.channelPrefix = options.channelPrefix;
		this._channelMap = {};
		this._channelEventDemux = new StreamDemux<ChannelEvent>();
		this.listeners = new ChannelsListeners(this._channelEventDemux);
		this._channelDataDemux = new StreamDemux<T[keyof T & string]>();
		this.output = new StreamDemuxWrapper<T[keyof T & string]>(this._channelDataDemux);
	}

	// Cancel any pending subscribe callback
	protected cancelPendingSubscribeCallback(channel: ChannelDetails): void {
		if (channel.subscribeAbort) {
			channel.subscribeAbort();
		}
	}

	channel<U extends keyof T & string>(channelName: U): Channel<T, T[U]>;
	channel<U>(channelName: string): Channel<T, U>;
	channel<U>(channelName: string): Channel<T, U> {
		const currentChannel = this._channelMap[channelName];

		return new Channel<T, U>(
			channelName,
			this,
			this._channelEventDemux,
			this._channelDataDemux
		);
	}


	close(channelName?: keyof T & string | string): void {
		this.output.close(channelName);
		this.listeners.close(channelName);
	}

	protected decorateChannelName(channelName: keyof T & string | string): string {
		return `${this.channelPrefix || ''}${channelName}`;
	}

	kill(channelName?: keyof T & string | string): void {
		this.output.kill(channelName);
		this.listeners.kill(channelName);
	}

	getBackpressure(channelName?: keyof T & string | string): number {
		return Math.max(
			this.output.getBackpressure(channelName),
			this.listeners.getBackpressure(channelName)
		);
	}

	getState(channelName: keyof T & string | string): ChannelState {
		const channel = this._channelMap[channelName];

		if (channel) {
			return channel.state;
		}

		return 'unsubscribed';
	}

	getOptions(channelName: keyof T & string | string): ChannelOptions {
		const channel = this._channelMap[channelName];

		if (channel) {
			return { ...channel.options };
		}
		return {};
	}

	kickOut(channelName: keyof T & string | string, message: string): void {
		const undecoratedChannelName = this.undecorateChannelName(channelName);		
		const channel = this._channelMap[undecoratedChannelName];

		if (channel) {
			this.emit('kickOut', {
				channel: undecoratedChannelName,
				message: message
			});
			this._channelEventDemux.write(`${undecoratedChannelName}/kickOut`, { channel: undecoratedChannelName, message });
			this.triggerChannelUnsubscribe(channel);
		}
	}

	subscribe<U extends keyof T & string>(channelName: U, options?: ChannelOptions): Channel<T, T[U]>;
	subscribe<U>(channelName: string, options?: ChannelOptions): Channel<T, U>;
	subscribe<U>(channelName: string, options?: ChannelOptions): Channel<T, U> {
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
				state: 'pending',
				options: sanitizedOptions
			};
			this._channelMap[channelName] = channel;
			this.trySubscribe(channel);
		} else if (options) {
			channel.options = sanitizedOptions;
		}

		const channelIterable = new Channel<T, U>(
			channelName,
			this,
			this._channelEventDemux,
			this._channelDataDemux
		);

		return channelIterable;
	}

	protected triggerChannelSubscribe(channel: ChannelDetails, options: ChannelOptions): void {
		const channelName = channel.name;

		if (channel.state !== 'subscribed') {
			const oldState = channel.state;
			channel.state = 'subscribed';

			const stateChangeData: SubscribeStateChangeEvent = {
				channel: channelName,
				oldState,
				newState: channel.state,
				options
			};
			this._channelEventDemux.write(`${channelName}/subscribeStateChange`, stateChangeData);
			this._channelEventDemux.write(`${channelName}/subscribe`, { channel: channel.name, options });
			this.emit('subscribeStateChange', stateChangeData);
			this.emit('subscribe', { channel: channelName, options });
		}
	}

	protected triggerChannelUnsubscribe(channel: ChannelDetails, setAsPending?: boolean): void {
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
			this.emit('subscribeStateChange', stateChangeData);
			this.emit('unsubscribe', { channel: channelName });
		}

		if (setAsPending) {
			channel.state = 'pending';
		} else {
			delete this._channelMap[channelName];
		}
	}

	protected abstract trySubscribe(channel: ChannelDetails): void;

	protected abstract tryUnsubscribe(channel: ChannelDetails): void;

	protected undecorateChannelName(channelName: keyof T & string | string): string {
		if (this.channelPrefix && channelName.indexOf(this.channelPrefix) === 0) {
			return channelName.replace(this.channelPrefix, '');
		}

		return channelName;
	}

	unsubscribe(channelName: keyof T & string | string): void {
		const channel = this._channelMap[channelName];

		if (channel) {
			this.tryUnsubscribe(channel);
		}
	}

	subscriptions(includePending?: boolean): string[] {
		const subs: string[] = [];

		Object.keys(this._channelMap).forEach((channelName) => {
			if (includePending || this._channelMap[channelName].state === 'subscribed') {
				subs.push(channelName);
			}
		});
		return subs;
	}

	isSubscribed(channelName: keyof T & string | string, includePending?: boolean): boolean {
		const channel = this._channelMap[channelName];

		if (includePending) {
			return !!channel;
		}
		return !!channel && channel.state === 'subscribed';
	}

	emit(eventName: 'kickOut', data: KickOutEvent): void;
	emit(eventName: 'subscribe', data: SubscribeEvent): void;
	emit(eventName: 'subscribeFail', data: SubscribeFailEvent): void;
	emit(eventName: 'subscribeRequest', data: SubscribeEvent): void;
	emit(eventName: 'subscribeStateChange', data: SubscribeStateChangeEvent): void;
	emit(eventName: 'unsubscribe', data: UnsubscribeEvent): void;
	emit(eventName: string, data: ChannelEvent): void {
		super.emit(eventName, data);
	}

	listen(): DemuxedConsumableStream<StreamEvent<ChannelEvent>>;
	listen(eventName: 'kickOut'): DemuxedConsumableStream<KickOutEvent>;
	listen(eventName: 'subscribe'): DemuxedConsumableStream<SubscribeEvent>;
	listen(eventName: 'subscribeFail'): DemuxedConsumableStream<SubscribeFailEvent>;
	listen(eventName: 'subscribeRequest'): DemuxedConsumableStream<SubscribeEvent>;
	listen(eventName: 'subscribeStateChange'): DemuxedConsumableStream<SubscribeStateChangeEvent>;
	listen(eventName: 'unsubscribe'): DemuxedConsumableStream<UnsubscribeEvent>;
	listen<U extends ChannelEvent, V = U>(eventName: string): DemuxedConsumableStream<V>;	
	listen<U extends ChannelEvent, V = U>(eventName?: string): DemuxedConsumableStream<StreamEvent<ChannelEvent>> | DemuxedConsumableStream<V> {
		return super.listen<U, V>(eventName);
	}

	abstract transmitPublish<U extends keyof T & string>(channelName: U, data: T[U]): Promise<void>;
	abstract transmitPublish<U>(channelName: string, data: U): Promise<void>;
	abstract transmitPublish<U>(channelName: keyof T & string | string, data: U): Promise<void>;

	abstract invokePublish<U extends keyof T & string>(channelName: keyof T & string, data: T[U]): Promise<void>
	abstract invokePublish<U>(channelName: string, data: U): Promise<void>;
	abstract invokePublish<U>(channelName: keyof T & string | string, data: U): Promise<void>;

	write<U extends keyof T & string>(channelName: keyof T & string, data: T[U]): void
	write<U>(channelName: string, data: U): void;
	write<U extends T[keyof T & string]>(channelName: string, data: U): void {
		const undecoratedChannelName = this.undecorateChannelName(channelName);
		const isSubscribed = this.isSubscribed(undecoratedChannelName, true);

		if (isSubscribed) {
			this._channelDataDemux.write(undecoratedChannelName, data);
		}
	}	
}