import { StreamDemux, StreamDemuxStats } from '@socket-mesh/stream-demux';

import { ChannelEvent } from './channel-events.js';
import { ChannelMap } from './channel-map.js';

export class ChannelsListeners<TChannelMap extends ChannelMap> {
	private readonly _eventDemux: StreamDemux<ChannelEvent>;

	constructor(eventDemux: StreamDemux<ChannelEvent>) {
		this._eventDemux = eventDemux;
	}

	close(channelName: keyof TChannelMap & string | string, eventName: 'subscribe'): void;
	close(channelName: keyof TChannelMap & string | string, eventName: 'subscribeStateChange'): void;
	close(channelName: keyof TChannelMap & string | string, eventName: 'subscribeFail'): void;
	close(channelName: keyof TChannelMap & string | string, eventName: 'unsubscribe'): void;
	close(channelName?: keyof TChannelMap & string | string, eventName?: string): void;
	close(channelName?: keyof TChannelMap & string | string, eventName?: string): void {
		if (channelName === undefined) {
			this._eventDemux.closeAll();
			return;
		}

		if (typeof eventName === 'string') {
			this._eventDemux.close(`${channelName}/${eventName}`);
			return;
		}

		this.getAllStreamNames(channelName)
			.forEach((streamName) => {
				this._eventDemux.close(streamName);
			}
			);
	}

	private getAllStreamNames(channelName: keyof TChannelMap & string | string): string[] {
		const streamNamesLookup = this._eventDemux.getConsumerStats()
			.filter((stats) => {
				return stats.stream.indexOf(`${channelName}/`) === 0;
			})
			.reduce((accumulator: { [key: string]: boolean }, stats) => {
				accumulator[stats.stream] = true;
				return accumulator;
			}, {});

		return Object.keys(streamNamesLookup);
	}

	getBackpressure(consumerId?: number): number;
	getBackpressure(channelName: keyof TChannelMap & string | string, eventName: 'subscribe'): number;
	getBackpressure(channelName: keyof TChannelMap & string | string, eventName: 'subscribeStateChange'): number;
	getBackpressure(channelName: keyof TChannelMap & string | string, eventName: 'subscribeFail'): number;
	getBackpressure(channelName: keyof TChannelMap & string | string, eventName: 'unsubscribe'): number;
	getBackpressure(channelName?: keyof TChannelMap & string | string, eventName?: string): number;
	getBackpressure(channelName?: keyof TChannelMap & string | number | string, eventName?: string): number {
		if (channelName === undefined) {
			return this._eventDemux.getBackpressure();
		}

		if (typeof channelName === 'number') {
			return this._eventDemux.getBackpressure(channelName /* consumerId */);
		}

		if (typeof eventName === 'string') {
			return this._eventDemux.getBackpressure(`${channelName}/${eventName}`);
		}

		const listenerStreamBackpressures = this.getAllStreamNames(channelName)
			.map((streamName) => {
				return this._eventDemux.getBackpressure(streamName);
			}
			);

		return Math.max(...listenerStreamBackpressures.concat(0));
	}

	getConsumerStats(consumerId?: number): StreamDemuxStats;
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: 'subscribe'): StreamDemuxStats[];
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: 'subscribeStateChange'): StreamDemuxStats[];
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: 'subscribeFail'): StreamDemuxStats[];
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: 'unsubscribe'): StreamDemuxStats[];
	getConsumerStats(channelName?: keyof TChannelMap & string, eventName?: string): StreamDemuxStats[];
	getConsumerStats(channelName?: keyof TChannelMap & string | number, eventName?: string): StreamDemuxStats | StreamDemuxStats[] {
		if (channelName === undefined) {
			return this._eventDemux.getConsumerStats();
		}

		if (typeof channelName === 'number') {
			return this._eventDemux.getConsumerStats(channelName /* consumerId */);
		}

		if (typeof eventName === 'string') {
			return this._eventDemux.getConsumerStats(`${channelName}/${eventName}`);
		}

		return this.getAllStreamNames(channelName)
			.map((streamName) => {
				return this._eventDemux.getConsumerStats(streamName);
			})
			.reduce((accumulator, statsList) => {
				statsList.forEach((stats) => {
					accumulator.push(stats);
				});
				return accumulator;
			}, []);
	}

	hasConsumer(channelName: keyof TChannelMap & string | string, consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string | string, eventName: 'subscribe', consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string | string, eventName: 'subscribeStateChange', consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string | string, eventName: 'subscribeFail', consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string | string, eventName: 'unsubscribe', consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string | string, eventName: string, consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string | string, eventName: number | string, consumerId?: number): boolean {
		if (typeof eventName === 'string') {
			return this._eventDemux.hasConsumer(`${channelName}/${eventName}`, consumerId!);
		}

		return this.getAllStreamNames(channelName)
			.some((streamName) => {
				return this._eventDemux.hasConsumer(streamName, eventName /* consumerId */);
			});
	}

	kill(consumerId?: number): void;
	kill(channelName: keyof TChannelMap & string | string, eventName: 'subscribe'): void;
	kill(channelName: keyof TChannelMap & string | string, eventName: 'subscribeStateChange'): void;
	kill(channelName: keyof TChannelMap & string | string, eventName: 'subscribeFail'): void;
	kill(channelName: keyof TChannelMap & string | string, eventName: 'unsubscribe'): void;
	kill(channelName?: keyof TChannelMap & string | string, eventName?: string): void;
	kill(channelName?: keyof TChannelMap & string | number | string, eventName?: string): void {
		if (channelName === undefined) {
			this._eventDemux.killAll();
			return;
		}

		if (typeof channelName === 'number') {
			this._eventDemux.kill(channelName /* consumerId */);
			return;
		}

		if (eventName) {
			this._eventDemux.kill(`${channelName}/${eventName}`);
			return;
		}

		this.getAllStreamNames(channelName)
			.forEach((streamName) => {
				this._eventDemux.kill(streamName);
			}
			);
	}
}
