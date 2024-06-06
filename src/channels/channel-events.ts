import { ChannelOptions } from "./channel-options.js";
import { ChannelState } from "./channel-state.js";

export type ChannelEvent = KickOutEvent | SubscribeEvent | SubscribeFailEvent | SubscribeStateChangeEvent | UnsubscribeEvent;

export interface KickOutEvent {
	channel: string,
	message: string
}

export interface SubscribeEvent {
	channel: string,
	options: ChannelOptions
}

export interface SubscribeFailEvent {
	channel: string,
	options: ChannelOptions,
	error: Error
}

export interface SubscribeStateChangeEvent {
	channel: string,
	oldState: ChannelState,
	newState: ChannelState,
	options: ChannelOptions
}

export interface UnsubscribeEvent {
	channel: string
}