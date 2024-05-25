import { ChannelMap } from "../../client/channels/channel-map.js";
import { Broker } from "./broker.js";

export class SimpleExchange<T extends ChannelMap> {
	readonly id: string;
	private readonly _broker: Broker<T>;

	constructor(broker: Broker<T>) {
		this.id = 'exchange';
		this._broker = broker;
	}


	transmitPublish<U extends keyof T & string>(channelName: U, data: T[U]): Promise<void> {
		return this._broker.transmitPublish(channelName, data);
	}

	invokePublish<U extends keyof T & string>(channelName: U, data: T[U]): Promise<void> {
		return this._broker.invokePublish(channelName, data);
	}
}