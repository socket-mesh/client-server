import { ConsumableStream } from "@socket-mesh/consumable-stream";
import { StreamDemux } from "./stream-demux.js";
import { WritableStreamConsumer } from "@socket-mesh/writable-consumable-stream";

export class DemuxedConsumableStream<T> extends ConsumableStream<T, T> {
	name: string;
	private _streamDemux: StreamDemux<T>;

	constructor(streamDemux: StreamDemux<T>, name: string) {
		super();
		this._streamDemux = streamDemux;
		this.name = name;
	}

	createConsumer(timeout?: number): WritableStreamConsumer<T, T | undefined> {
		return this._streamDemux.createConsumer(this.name, timeout);
	}
}
