import { ConsumableStream } from "@socket-mesh/consumable-stream";
import { ChannelOptions } from "./channel-options.js";
import { ChannelState } from "./channel-state.js";
import { Channels } from "./channels.js";
import { DemuxedConsumableStream, StreamDemux } from "@socket-mesh/stream-demux";
import { ChannelListeners } from "./channel-listeners.js";
import { ChannelOutput } from "./channel-output.js";
import { ChannelEvent, ChannelSubscribeEvent, ChannelSubscribeFailEvent, ChannelSubscribeStateChangeEvent, ChannelUnsubscribeEvent } from "./channel-events.js";
import { ChannelMap } from "./channel-map.js";
import { MethodMap, PublicMethodMap, ServiceMap } from "../maps/method-map.js";
import { ServerPrivateMap } from "../maps/server-private-map.js";
import { WritableStreamConsumer } from "@socket-mesh/writable-consumable-stream";

export class Channel<
	TChannelMap extends ChannelMap<TChannelMap>,
	TItem,
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap & ServerPrivateMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object
> extends ConsumableStream<TItem> {
	readonly channels: Channels<TChannelMap, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	readonly listeners: ChannelListeners<TChannelMap>;
	readonly name: string;
	readonly output: ChannelOutput;

	private readonly _eventDemux: StreamDemux<ChannelEvent>;
	private readonly _dataStream: DemuxedConsumableStream<TItem>;

	constructor(
		name: string,
		channels: Channels<
			TChannelMap,
			TIncomingMap,
			TServiceMap,
			TOutgoingMap,
			TPrivateOutgoingMap,
			TSocketState
		>,
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

	listen(eventName: 'subscribe'): DemuxedConsumableStream<ChannelSubscribeEvent>;
	listen(eventName: 'subscribeStateChange'): DemuxedConsumableStream<ChannelSubscribeStateChangeEvent>;
	listen(eventName: 'subscribeFail'): DemuxedConsumableStream<ChannelSubscribeFailEvent>;
	listen(eventName: 'unsubscribe'): DemuxedConsumableStream<ChannelUnsubscribeEvent>;
	listen<U>(eventName: string): DemuxedConsumableStream<U>;
	listen<U>(eventName: string): DemuxedConsumableStream<ChannelEvent | U> {
		return this._eventDemux.listen(`${this.name}/${eventName}`);
	}

	createConsumer(timeout?: number): WritableStreamConsumer<TItem> {
		return this._dataStream.createConsumer(timeout);
	}

	close(): void {
		this.channels.close(this.name);
	}

	getBackpressure(): number {
		return this.channels.getBackpressure(this.name);
	}

	kill(): void {
		this.channels.kill(this.name);
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