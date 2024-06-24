import { ChannelMap } from "../../channels/channel-map.js";
import { ChannelDetails, ChannelsOptions, PublishOptions } from "../../channels/channels.js";
import { Broker } from "./broker.js";
import { Exchange } from "./exchange.js";

export class SimpleExchange<T extends ChannelMap> extends Exchange<T> {
	readonly id: string;
	private readonly _broker: Broker<T>;

	constructor(broker: Broker<T>, options?: ChannelsOptions) {
		super(options);
		this.id = 'exchange';
		this._broker = broker;
	}

	protected async trySubscribe(channel: ChannelDetails): Promise<void> {
		channel.state = 'subscribed';

		this._channelEventDemux.write(`${channel.name}/subscribe`, { channel: channel.name });
		this._broker.subscribe(this, channel.name);
		this.emit('subscribe', { channel: channel.name, options: channel.options });
	}

	protected async tryUnsubscribe(channel: ChannelDetails): Promise<void> {
		delete this._channelMap[channel.name];

		if (channel.state === 'subscribed') {
			this._channelEventDemux.write(`${channel.name}/unsubscribe`, { channel: channel.name });
			await this._broker.unsubscribe(this, channel.name);
			this.emit('unsubscribe', { channel: channel.name });
		}
	}

	async transmit(event: '#publish', packet: PublishOptions): Promise<void> {
		if (event === '#publish') {
			this._channelDataDemux.write(packet.channel, packet.data);
		}
	}

	async transmitPublish<U extends keyof T & string>(channelName: U, data: T[U]): Promise<void> {
		await this._broker.transmitPublish(channelName, data);
	}

	async invokePublish<U extends keyof T & string>(channelName: U, data: T[U]): Promise<void> {
		await this._broker.invokePublish(channelName, data);
	}
}