import { ConsumableStream } from "@socket-mesh/consumable-stream";
import { ChannelOptions } from "./channel-options.js";
import { ChannelState } from "./channel-state.js";
import { Channels } from "./channels.js";
import { DemuxedConsumableStream, StreamDemux } from "@socket-mesh/stream-demux";
import { ChannelListeners } from "./channel-listeners.js";
import { ChannelOutput } from "./channel-output.js";
import { ChannelEvent, SubscribeEvent, SubscribeFailEvent, SubscribeStateChangeEvent, UnsubscribeEvent } from "./channel-events.js";
import { WritableStreamConsumer } from "@socket-mesh/writable-consumable-stream";
import { ChannelMap } from "./channel-map.js";

export class Channel<TChannelMap extends ChannelMap, TItem> extends ConsumableStream<TItem> {
	readonly channels: Channels<TChannelMap>;
	readonly listeners: ChannelListeners<TChannelMap>;
	readonly name: string;
	readonly output: ChannelOutput;

	private readonly _eventDemux: StreamDemux<ChannelEvent>;
	private readonly _dataStream: DemuxedConsumableStream<TItem>;

	constructor(
		name: string,
		channels: Channels<TChannelMap>,
		eventDemux: StreamDemux<ChannelEvent>,
		dataDemux: StreamDemux<TChannelMap[keyof TChannelMap & string]>
	) {
		super();

		this.name = name;
		this.channels = channels;

		this.listeners = new ChannelListeners(name, channels.listeners);
		this.output = new ChannelOutput(name, channels.output);
		this._eventDemux = eventDemux;
		this._dataStream = dataDemux.listen(this.name);
	}

	emit(event: 'subscribe', data: SubscribeEvent): void;
	emit(event: 'subscribeStateChange', data: SubscribeStateChangeEvent): void;
	emit(event: 'subscribeFail', data: SubscribeFailEvent): void;
	emit(event: 'unsubscribe', data: UnsubscribeEvent): void;
	emit<U>(event: string, data: U): void;
	emit<U>(event: string, data: U | ChannelEvent): void {
		this._eventDemux.write(`${this.name}/${event}`, data as ChannelEvent);
	}

	listen(event: 'subscribe'): DemuxedConsumableStream<SubscribeEvent>;
	listen(event: 'subscribeStateChange'): DemuxedConsumableStream<SubscribeStateChangeEvent>;
	listen(event: 'subscribeFail'): DemuxedConsumableStream<SubscribeFailEvent>;
	listen(event: 'unsubscribe'): DemuxedConsumableStream<UnsubscribeEvent>;
	listen<U>(event: string): DemuxedConsumableStream<U>;
	listen<U>(event: string): DemuxedConsumableStream<ChannelEvent | U> {
		return this._eventDemux.listen(`${this.name}/${event}`);
	}

	createConsumer(timeout?: number): WritableStreamConsumer<TItem> {
		return this._dataStream.createConsumer(timeout);
	}

	close(): void {
		this.channels.close(this.name);
	}

	closeEvent(event: string): void {
		this._eventDemux.close(`${this.name}/${event}`);
	}

	getBackpressure(): number {
		return this.channels.getBackpressure(this.name);
	}

	kill(): void {
		this.channels.kill(this.name);
	}

	killEvent(event: string): void {
		this._eventDemux.kill(`${this.name}/${event}`);
	}

	get state(): ChannelState {
		return this.channels.getState(this.name);
	}

	get options(): ChannelOptions {
		return this.channels.getOptions(this.name);
	}

	subscribe(options: ChannelOptions): void {
		this.channels.subscribe(this.name, options);
	}

	unsubscribe(): void {
		this.channels.unsubscribe(this.name);
	}

	isSubscribed(includePending: boolean): boolean {
		return this.channels.isSubscribed(this.name, includePending);
	}

	transmitPublish(data: TItem): Promise<void> {
		return this.channels.transmitPublish(this.name, data);
	}

	invokePublish(data: TItem): Promise<void> {
		return this.channels.invokePublish(this.name, data);
	}
}