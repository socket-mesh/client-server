export enum ChannelState {
	SUBSCRIBED = "subscribed",
	PENDING = "pending",
	UNSUBSCRIBED = "unsubscribed"
}

export interface ChannelStateChange {
	oldState: ChannelState,
	newState: ChannelState
}