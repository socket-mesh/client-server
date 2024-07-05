export interface ServerSocketState {
	channelSubscriptions?: { [channel: string]: true },
	channelSubscriptionsCount?: number
}
