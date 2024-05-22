import { StreamDemux, StreamDemuxStats } from "@socket-mesh/stream-demux";
import { ChannelEvent } from "./channel-events.js";
import { ChannelMap } from "./channel-map.js";

export class ChannelsListeners<TChannelMap extends ChannelMap<TChannelMap>> {
	private readonly _eventDemux: StreamDemux<ChannelEvent>;

	constructor(eventDemux: StreamDemux<ChannelEvent>) {
		this._eventDemux = eventDemux;
	}

	getConsumerStats(): StreamDemuxStats[]; 
	getConsumerStats(consumerId: number): StreamDemuxStats;
	getConsumerStats(channelName: keyof TChannelMap & string): StreamDemuxStats[];
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: 'subscribe') : StreamDemuxStats[];
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: 'subscribeStateChange') : StreamDemuxStats[];
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: 'subscribeFail') : StreamDemuxStats[];
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: 'unsubscribe') : StreamDemuxStats[];
	getConsumerStats(channelName: keyof TChannelMap & string, eventName: string) : StreamDemuxStats[];
	getConsumerStats(channelName?: number | keyof TChannelMap & string, eventName?: string): StreamDemuxStats[] | StreamDemuxStats {
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

	getBackpressure(): number;
	getBackpressure(consumerId: number): number;
	getBackpressure(channelName: keyof TChannelMap & string): number;
	getBackpressure(channelName: keyof TChannelMap & string, eventName: 'subscribe') : number;
	getBackpressure(channelName: keyof TChannelMap & string, eventName: 'subscribeStateChange') : number;
	getBackpressure(channelName: keyof TChannelMap & string, eventName: 'subscribeFail') : number;
	getBackpressure(channelName: keyof TChannelMap & string, eventName: 'unsubscribe') : number;
	getBackpressure(channelName: keyof TChannelMap & string, eventName: string): number;
	getBackpressure(channelName?: number | keyof TChannelMap & string, eventName?: string): number {
		if (channelName === undefined) {
			return this._eventDemux.getBackpressure();
		}

		if (typeof channelName === 'number') {
			return this._eventDemux.getBackpressure(channelName /* consumerId */);
		}
		
		if (typeof eventName === 'string') {
			return this._eventDemux.getBackpressure(`${channelName}/${eventName}`);
		}

		let listenerStreamBackpressures = this.getAllStreamNames(channelName)
			.map((streamName) => {
				return this._eventDemux.getBackpressure(streamName);
			}
		);

		return Math.max(...listenerStreamBackpressures.concat(0));
	}

	close(): void;
	close(channelName: keyof TChannelMap & string): void;
	close(channelName: keyof TChannelMap & string, eventName: 'subscribe') : void;
	close(channelName: keyof TChannelMap & string, eventName: 'subscribeStateChange') : void;
	close(channelName: keyof TChannelMap & string, eventName: 'subscribeFail') : void;
	close(channelName: keyof TChannelMap & string, eventName: 'unsubscribe') : void;
	close(channelName: keyof TChannelMap & string, eventName: string): void;
	close(channelName?: keyof TChannelMap & string, eventName?: string): void {
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

	kill(): void;
	kill(consumerId: number): void;
	kill(channelName: keyof TChannelMap & string, eventName: 'subscribe') : void;
	kill(channelName: keyof TChannelMap & string, eventName: 'subscribeStateChange') : void;
	kill(channelName: keyof TChannelMap & string, eventName: 'subscribeFail') : void;
	kill(channelName: keyof TChannelMap & string, eventName: 'unsubscribe') : void;
	kill(channelName: keyof TChannelMap & string, eventName?: string): void;
	kill(channelName?: keyof TChannelMap & string | number, eventName?: string): void {
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

	hasConsumer(channelName: keyof TChannelMap & string, consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string, eventName: 'subscribe', consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string, eventName: 'subscribeStateChange', consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string, eventName: 'subscribeFail', consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string, eventName: 'unsubscribe', consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string, eventName: string, consumerId: number): boolean;
	hasConsumer(channelName: keyof TChannelMap & string, eventName: string | number, consumerId?: number): boolean {
		if (typeof eventName === 'string') {
			return this._eventDemux.hasConsumer(`${channelName}/${eventName}`, consumerId);
		}

		return this.getAllStreamNames(channelName)
			.some((streamName) => {
				return this._eventDemux.hasConsumer(streamName, eventName /* consumerId */);
			});
	}

	private getAllStreamNames(channelName: keyof TChannelMap & string): string[] {
		const streamNamesLookup = this._eventDemux.getConsumerStats()
			.filter((stats) => {
				return stats.stream.indexOf(`${channelName}/`) === 0;
			})
			.reduce((accumulator: {[key: string]: boolean}, stats) => {
				accumulator[stats.stream] = true;
				return accumulator;
			}, {});
		
		return Object.keys(streamNamesLookup);
	}
}