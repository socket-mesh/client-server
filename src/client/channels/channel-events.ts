import { ChannelOptions } from "./channel-options.js";
import { ChannelState } from "./channel-state.js";

export type ChannelEvent = ChannelSubscribeEvent | ChannelSubscribeFailEvent | ChannelSubscribeStateChangeEvent | ChannelUnsubscribeEvent;

export interface ChannelSubscribeEvent {
	options: ChannelOptions
}

export interface ChannelSubscribeFailEvent {
	options: ChannelOptions,
	error: Error
}

export interface ChannelSubscribeStateChangeEvent {
	oldState: ChannelState,
	newState: ChannelState,
	options: ChannelOptions
}

export interface ChannelUnsubscribeEvent {}