import { Broker } from "./broker.js";
import { ChannelMap } from "../../client/channels/channel-map.js";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { PublishOptions } from "../../client/maps/client-map.js";
import { SocketTransport } from "../../socket-transport.js";
import { SimpleExchange } from "./simple-exchange.js";

export class SimpleBroker<T extends ChannelMap> extends Broker<T> {
	readonly exchange: SimpleExchange<T>;
	private readonly _clientSubscribers: { [channelName: string]: {[id: string]: SocketTransport<BasicSocketMapServer>} };
	private readonly _clientSubscribersCounter: {[ channelName: string ]: number};

	constructor() {
		super();

		this.exchange = new SimpleExchange(this);
		this._clientSubscribers = {};
		this._clientSubscribersCounter = {};
	}

	subscribeSocket(transport: SocketTransport<BasicSocketMapServer>, channelName: string): void {
		if (!this._clientSubscribers[channelName]) {
			this._clientSubscribers[channelName] = {};
			this._clientSubscribersCounter[channelName] = 0;
			this.emit('subscribe', { channel: channelName });
		}
		if (!this._clientSubscribers[channelName][transport.id]) {
			this._clientSubscribersCounter[channelName]++;
		}
		this._clientSubscribers[channelName][transport.id] = transport;
	}

	unsubscribeSocket(transport: SocketTransport<BasicSocketMapServer>, channelName: string): void {
		if (this._clientSubscribers[channelName]) {
			if (this._clientSubscribers[channelName][transport.id]) {
				this._clientSubscribersCounter[channelName]--;
				delete this._clientSubscribers[channelName][transport.id];

				if (this._clientSubscribersCounter[channelName] <= 0) {
					delete this._clientSubscribers[channelName];
					delete this._clientSubscribersCounter[channelName];
					this.emit('unsubscribe', { channel: channelName });
				}
			}
		}
	}

	subscriptions(): string[] {
		return Object.keys(this._clientSubscribers);
	}

	isSubscribed(channelName: string): boolean {
		return !!this._clientSubscribers[channelName];
	}

	// In this implementation of the broker engine, both invokePublish and transmitPublish
	// methods are the same. In alternative implementations, they could be different.
	invokePublish<U extends keyof T & string>(channelName: U, data: T[U], suppressEvent?: boolean): Promise<void> {
		return this.transmitPublish(channelName, data, suppressEvent);
	}

	async transmitPublish<U extends keyof T & string>(channelName: U, data: T[U], suppressEvent?: boolean): Promise<void> {
		const packet: PublishOptions = {
			channel: channelName,
			data
		};

		const subscriberClients = this._clientSubscribers[channelName] || {};
		const work: Promise<void>[] = [];

		for (const i in subscriberClients) {
			work.push(subscriberClients[i].transmit('#publish', packet));
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
}