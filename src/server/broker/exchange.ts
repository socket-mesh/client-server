import { ChannelMap } from "../../client/channels/channel-map.js";

export interface Exchange<T extends ChannelMap> {
	id: string;

	transmitPublish<U extends keyof T & string>(channelName: U, data: T[U]): Promise<void>;

	invokePublish<U extends keyof T & string>(channelName: U, data: T[U]): Promise<void>;
}