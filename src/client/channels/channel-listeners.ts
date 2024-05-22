import { StreamDemuxStats } from "@socket-mesh/stream-demux";
import { ChannelsListeners } from "./channels-listeners.js";
import { ChannelMap } from "./channel-map.js";

export class ChannelListeners<TChannelMap extends ChannelMap<TChannelMap>, TChannel extends keyof TChannelMap & string> {
	private readonly _name: TChannel;
	private readonly _listeners: ChannelsListeners<TChannelMap>;

	constructor(name: TChannel, listeners: ChannelsListeners<TChannelMap>) {
		this._name = name;
		this._listeners = listeners;
	}

	getConsumerStats(eventName: 'subscribe'): StreamDemuxStats[];
	getConsumerStats(eventName: 'subscribeStateChange'): StreamDemuxStats[];
	getConsumerStats(eventName: 'subscribeFail'): StreamDemuxStats[];
	getConsumerStats(eventName: 'unsubscribe'): StreamDemuxStats[];
	getConsumerStats(eventName?: string): StreamDemuxStats[];
	getConsumerStats(consumerId: number): StreamDemuxStats | undefined;
	getConsumerStats(consumerId: number | string): StreamDemuxStats[] | StreamDemuxStats | undefined {
		if (typeof consumerId === 'number') {
			if (this.hasConsumer(consumerId)) {
				return this._listeners.getConsumerStats(consumerId);
			}
			return undefined;
		}

		return this._listeners.getConsumerStats(this._name, consumerId /* eventName */);
	}

	getBackpressure(eventName: 'subscribe'): number;
	getBackpressure(eventName: 'subscribeStateChange'): number;
	getBackpressure(eventName: 'subscribeFail'): number;
	getBackpressure(eventName: 'unsubscribe'): number;
	getBackpressure(eventName?: string): number;
	getBackpressure(consumerId: number): number;
	getBackpressure(consumerId?: number | string): number {
		if (typeof consumerId === 'number') {
			if (this.hasConsumer(consumerId)) {
				return this._listeners.getBackpressure(consumerId);
			}

			return 0;	
		}

		return this._listeners.getBackpressure(this._name, consumerId /* eventName */);
	}

	hasConsumer(consumerId: number): boolean;
	hasConsumer(eventName: 'subscribe', consumerId: number): boolean;
	hasConsumer(eventName: 'subscribeStateChange', consumerId: number): boolean;
	hasConsumer(eventName: 'subscribeFail', consumerId: number): boolean;
	hasConsumer(eventName: 'unsubscribe', consumerId: number): boolean;
	hasConsumer(eventName: string, consumerId: number): boolean;
	hasConsumer(eventName: string | number, consumerId?: number): boolean {
		if (typeof eventName === 'string') {
			return this._listeners.hasConsumer(this._name, eventName, consumerId);
		}

		return this._listeners.hasConsumer(this._name, eventName /* consumerId */);
	}

	close(): void;
	close(eventName: 'subscribe'): void;
	close(eventName: 'subscribeStateChange'): void;
	close(eventName: 'subscribeFail'): void;
	close(eventName: 'unsubscribe'): void;
	close(eventName: string): void;
	close(eventName?: string): void {
		this._listeners.close(this._name, eventName);
	}

	kill(): void;
	kill(consumerId: number): void;
	kill(eventName: 'subscribe'): void;
	kill(eventName: 'subscribeStateChange'): void;
	kill(eventName: 'subscribeFail'): void;
	kill(eventName: 'unsubscribe'): void;
	kill(eventName: string): void;
	kill(eventName?: string | number): void {
		if (typeof eventName === 'number') {
			if (this.hasConsumer(eventName /* consumerId */)) {
				this._listeners.kill(eventName /* consumerId */);
			}

			return;
		}

		this._listeners.kill(this._name, eventName);
	}
}