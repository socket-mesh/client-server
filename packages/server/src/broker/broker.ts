import { AsyncStreamEmitter } from '@socket-mesh/async-stream-emitter';
import { ChannelMap } from '@socket-mesh/channels';
import { DemuxedConsumableStream, StreamEvent } from '@socket-mesh/stream-demux';

import { BrokerEvent, ErrorEvent, PublishEvent, ReadyEvent, SubscribeEvent, UnsubscribeEvent } from './broker-events.js';
import { ExchangeClient } from './exchange-client.js';
import { Exchange } from './exchange.js';

export abstract class Broker<T extends ChannelMap> extends AsyncStreamEmitter<BrokerEvent<T[keyof T]>> {
	abstract readonly exchange: Exchange<T>;

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

	abstract invokePublish<U extends keyof T & string>(channelName: U, data: T[U], suppressEvent?: boolean): Promise<void>;
	abstract isSubscribed(channelName: string): boolean;
	listen(): DemuxedConsumableStream<StreamEvent<BrokerEvent<T[keyof T]>>>;
	listen(event: 'ready'): DemuxedConsumableStream<ReadyEvent>;
	listen(event: 'publish'): DemuxedConsumableStream<PublishEvent<T[keyof T]>>;
	listen(event: 'error'): DemuxedConsumableStream<ErrorEvent>;
	listen(event: 'subscribe'): DemuxedConsumableStream<SubscribeEvent>;
	listen(event: 'unsubscribe'): DemuxedConsumableStream<UnsubscribeEvent>;
	listen(event?: string): DemuxedConsumableStream<BrokerEvent<T>> | DemuxedConsumableStream<StreamEvent<BrokerEvent<T>>> {
		return super.listen(event!);
	}

	abstract subscribe(socket: ExchangeClient, channelName: string): Promise<void>;

	abstract subscriptions(): string[];

	abstract transmitPublish<U extends keyof T & string>(channelName: U, data: T[U], suppressEvent?: boolean): Promise<void>;

	abstract unsubscribe(socket: ExchangeClient, channelName: string): Promise<void>;
}
