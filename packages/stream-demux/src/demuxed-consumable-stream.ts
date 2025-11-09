import { ConsumableStream } from '@socket-mesh/consumable-stream';
import { WritableStreamConsumer } from '@socket-mesh/writable-consumable-stream';

import { StreamDemux } from './stream-demux.js';

export class DemuxedConsumableStream<T> extends ConsumableStream<T, T> {
	private _streamDemux: StreamDemux<T>;
	name: string;

	constructor(streamDemux: StreamDemux<T>, name: string) {
		super();
		this._streamDemux = streamDemux;
		this.name = name;
	}

	createConsumer(timeout?: number): WritableStreamConsumer<T, T | undefined> {
		return this._streamDemux.createConsumer(this.name, timeout);
	}
}
