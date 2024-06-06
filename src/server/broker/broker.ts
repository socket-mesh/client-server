import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";
import { DemuxedConsumableStream, StreamEvent } from "@socket-mesh/stream-demux";
import { BrokerEvent, ErrorEvent, PublishEvent, ReadyEvent, SubscribeEvent, UnsubscribeEvent } from "./broker-events.js";
import { ChannelMap } from "../../channels/channel-map.js";
import { Exchange } from "./exchange.js";
import { ExchangeClient } from "./exchange-client.js";

export abstract class Broker<T extends ChannelMap> extends AsyncStreamEmitter<BrokerEvent<T[keyof T]>>  {
	isReady: boolean;

	constructor() {
		super();

		this.isReady = false;

		setTimeout(() => {
			this.isReady = true;
			this.emit('ready', {});
		}, 0);
	}

	emit(event: 'error', data: ErrorEvent): void;
	emit(event: 'publish', data: PublishEvent<T[keyof T]>): void;
	emit(event: 'ready', data: ReadyEvent): void;
	emit(event: 'subscribe', data: SubscribeEvent): void;
	emit(event: 'unsubscribe', data: UnsubscribeEvent): void;
	emit(event: string, data: BrokerEvent<T[keyof T]>): void {
		super.emit(event, data);
	}

	listen(): DemuxedConsumableStream<StreamEvent<BrokerEvent<T[keyof T]>>>;
	listen(event: 'ready'): DemuxedConsumableStream<ReadyEvent>;
	listen(event: 'publish'): DemuxedConsumableStream<PublishEvent<T[keyof T]>>;
	listen(event: 'error'): DemuxedConsumableStream<ErrorEvent>;
	listen(event: 'subscribe'): DemuxedConsumableStream<SubscribeEvent>;
	listen(event: 'unsubscribe'): DemuxedConsumableStream<UnsubscribeEvent>;
	listen(event?: string): DemuxedConsumableStream<StreamEvent<BrokerEvent<T>>> | DemuxedConsumableStream<BrokerEvent<T>> {
		return super.listen(event);
	}

	abstract readonly exchange: Exchange<T>;

	abstract subscribe(socket: ExchangeClient, channelName: string): void;

	abstract subscriptions(): string[];
	
	abstract isSubscribed(channelName: string): boolean;

	abstract unsubscribe(socket: ExchangeClient, channelName: string): void;

	abstract transmitPublish<U extends keyof T & string>(channelName: U, data: T[U], suppressEvent?: boolean): Promise<void>;

	abstract invokePublish<U extends keyof T & string>(channelName: U, data: T[U], suppressEvent?: boolean): Promise<void>;
}