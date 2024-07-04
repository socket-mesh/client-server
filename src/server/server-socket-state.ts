import { ServerMap } from "../client/maps/server-map.js";

export interface ServerSocketState {
	channelSubscriptions?: { [channel: string]: true },
	channelSubscriptionsCount?: number
}
