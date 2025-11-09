import { DemuxedConsumableStream } from './demuxed-consumable-stream.js';
import { StreamDemuxStats } from './stream-demux-stats.js';
import { StreamDemux } from './stream-demux.js';

export class StreamDemuxWrapper<T> {
	private readonly _streamDemux: StreamDemux<T>;

	constructor(stream: StreamDemux<T>) {
		this._streamDemux = stream;
	}

	close(name?: string): void {
		if (name === undefined) {
			this._streamDemux.closeAll();
			return;
		}

		this._streamDemux.close(name);
	}

	getBackpressure(name?: string): number;
	getBackpressure(consumerId?: number): number;
	getBackpressure(consumerId?: number | string): number {
		return this._streamDemux.getBackpressure(consumerId as any);
	}

	getConsumerStats(name?: string): StreamDemuxStats[];
	getConsumerStats(consumerId?: number): StreamDemuxStats;
	getConsumerStats(consumerId?: number | string): StreamDemuxStats | StreamDemuxStats[] {
		return this._streamDemux.getConsumerStats(consumerId as any);
	}

	hasConsumer(consumerId: number): boolean;
	hasConsumer(name: string, consumerId: number): boolean;
	hasConsumer(name: number | string, consumerId?: number): boolean {
		if (typeof name === 'string') {
			return this._streamDemux.hasConsumer(name, consumerId!);
		}

		return this._streamDemux.hasConsumer(name /* consumerId */);
	}

	kill(consumerId?: number): void;
	kill(name?: string): void;
	kill(name?: number | string): void {
		if (name === undefined) {
			this._streamDemux.killAll();
			return;
		}

		this._streamDemux.kill(name as any);
	}

	listen<U extends T, V = U>(name: string): DemuxedConsumableStream<V> {
		return this._streamDemux.listen(name);
	}
}
