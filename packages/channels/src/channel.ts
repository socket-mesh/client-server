import { ConsumableStream } from '@socket-mesh/consumable-stream';
import { DemuxedConsumableStream, StreamDemux } from '@socket-mesh/stream-demux';
import { WritableStreamConsumer } from '@socket-mesh/writable-consumable-stream';

import { ChannelEvent, SubscribeEvent, SubscribeFailEvent, SubscribeStateChangeEvent, UnsubscribeEvent } from './channel-events.js';
import { ChannelListeners } from './channel-listeners.js';
import { ChannelMap } from './channel-map.js';
import { ChannelOptions } from './channel-options.js';
import { ChannelOutput } from './channel-output.js';
import { ChannelState } from './channel-state.js';
import { Channels } from './channels.js';

export class Channel<TChannelMap extends ChannelMap, TChannelName extends keyof TChannelMap & string> extends ConsumableStream<TChannelMap[TChannelName]> {
	private readonly _dataStream: DemuxedConsumableStream<TChannelMap[TChannelName]>;
	private readonly _eventDemux: StreamDemux<ChannelEvent>;
	readonly channels: Channels<TChannelMap>;
	readonly listeners: ChannelListeners<TChannelMap>;

	readonly name: TChannelName;
	readonly output: ChannelOutput;

	constructor(
		name: TChannelName,
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

	close(): void {
		this.channels.close(this.name);
	}

	closeEvent(event: string): void {
		this._eventDemux.close(`${this.name}/${event}`);
	}

	createConsumer(timeout?: number): WritableStreamConsumer<TChannelMap[TChannelName], TChannelMap[TChannelName] | undefined> {
		return this._dataStream.createConsumer(timeout);
	}

	emit(event: 'subscribe', data: SubscribeEvent): void;
	emit(event: 'subscribeStateChange', data: SubscribeStateChangeEvent): void;
	emit(event: 'subscribeFail', data: SubscribeFailEvent): void;
	emit(event: 'unsubscribe', data: UnsubscribeEvent): void;
	emit<U>(event: string, data: U): void;
	emit<U>(event: string, data: ChannelEvent | U): void {
		this._eventDemux.write(`${this.name}/${event}`, data as ChannelEvent);
	}

	getBackpressure(): number {
		return this.channels.getBackpressure(this.name);
	}

	invokePublish(data: TChannelMap[TChannelName]): Promise<void> {
		return this.channels.invokePublish(this.name, data);
	}

	isSubscribed(includePending: boolean): boolean {
		return this.channels.isSubscribed(this.name, includePending);
	}

	kill(): void {
		this.channels.kill(this.name);
	}

	killEvent(event: string): void {
		this._eventDemux.kill(`${this.name}/${event}`);
	}

	listen(event: 'subscribe'): DemuxedConsumableStream<SubscribeEvent>;
	listen(event: 'subscribeStateChange'): DemuxedConsumableStream<SubscribeStateChangeEvent>;
	listen(event: 'subscribeFail'): DemuxedConsumableStream<SubscribeFailEvent>;
	listen(event: 'unsubscribe'): DemuxedConsumableStream<UnsubscribeEvent>;
	listen<U>(event: string): DemuxedConsumableStream<U>;
	listen<U>(event: string): DemuxedConsumableStream<ChannelEvent | U> {
		return this._eventDemux.listen(`${this.name}/${event}`);
	}

	get options(): ChannelOptions {
		return this.channels.getOptions(this.name);
	}

	get state(): ChannelState {
		return this.channels.getState(this.name);
	}

	subscribe(options: ChannelOptions): void {
		this.channels.subscribe(this.name, options);
	}

	transmitPublish(data: TChannelMap[TChannelName]): Promise<void> {
		return this.channels.transmitPublish(this.name, data);
	}

	unsubscribe(): void {
		this.channels.unsubscribe(this.name);
	}
}
