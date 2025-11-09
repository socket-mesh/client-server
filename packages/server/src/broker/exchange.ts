import { ChannelMap, Channels } from '@socket-mesh/channels';

export abstract class Exchange<T extends ChannelMap> extends Channels<T> {
	id: string;
}
