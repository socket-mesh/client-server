import { ChannelMap } from "../../channels/channel-map.js";
import { Channels } from "../../channels/channels.js";

export abstract class Exchange<T extends ChannelMap> extends Channels<T> {
	id: string;
}