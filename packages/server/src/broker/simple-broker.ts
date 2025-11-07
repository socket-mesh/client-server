import { ChannelMap, PublishOptions } from '@socket-mesh/channels';

import { Broker } from './broker.js';
import { ExchangeClient } from './exchange-client.js';
import { SimpleExchange } from './simple-exchange.js';

export class SimpleBroker<T extends ChannelMap> extends Broker<T> {
	private readonly _clientSubscribers: { [channelName: string]: { [id: string]: ExchangeClient } };
	private readonly _clientSubscribersCounter: { [ channelName: string ]: number };
	readonly exchange: SimpleExchange<T>;

	constructor() {
		super();

		this.exchange = new SimpleExchange(this);
		this._clientSubscribers = {};
		this._clientSubscribersCounter = {};
	}

	// In this implementation of the broker engine, both invokePublish and transmitPublish
	// methods are the same. In alternative implementations, they could be different.
	invokePublish<U extends keyof T & string>(channelName: U, data: T[U], suppressEvent?: boolean): Promise<void> {
		return this.transmitPublish(channelName, data, suppressEvent);
	}

	isSubscribed(channelName: string): boolean {
		return !!this._clientSubscribers[channelName];
	}

	async subscribe(client: ExchangeClient, channelName: string): Promise<void> {
		if (!this._clientSubscribers[channelName]) {
			this._clientSubscribers[channelName] = {};
			this._clientSubscribersCounter[channelName] = 0;
			this.emit('subscribe', { channel: channelName });
		}
		if (!this._clientSubscribers[channelName][client.id]) {
			this._clientSubscribersCounter[channelName]!++;
		}
		this._clientSubscribers[channelName][client.id] = client;
	}

	subscriptions(): string[] {
		return Object.keys(this._clientSubscribers);
	}

	async transmitPublish<U extends keyof T & string>(channelName: U, data: T[U], suppressEvent?: boolean): Promise<void> {
		const packet: PublishOptions = {
			channel: channelName,
			data
		};

		const subscriberClients = this._clientSubscribers[channelName] || {};
		const work: Promise<void>[] = [];

		for (const i in subscriberClients) {
			work.push(subscriberClients[i]!.transmit('#publish', packet));
		}

		const result = await Promise.allSettled(work);

		for (const item of result) {
			if (item.status === 'rejected') {
				this.emit('error', item.reason);
			}
		}

		if (!suppressEvent) {
			this.emit('publish', packet);
		}
	}

	async unsubscribe(client: ExchangeClient, channelName: string): Promise<void> {
		if (this._clientSubscribers[channelName]) {
			if (this._clientSubscribers[channelName][client.id]) {
				this._clientSubscribersCounter[channelName]!--;
				delete this._clientSubscribers[channelName][client.id];

				if (this._clientSubscribersCounter[channelName]! <= 0) {
					delete this._clientSubscribers[channelName];
					delete this._clientSubscribersCounter[channelName];
					this.emit('unsubscribe', { channel: channelName });
				}
			}
		}
	}
}
