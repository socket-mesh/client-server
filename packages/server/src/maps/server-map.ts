import { ChannelMap } from "@socket-mesh/channels";
import { ClientPrivateMap, PrivateMethodMap, PublicMethodMap, ServerPrivateMap, ServiceMap } from "@socket-mesh/client";
import { ServerSocketState } from "../server-socket-state.js";

export interface ServerMap {
	Channel: ChannelMap,
	Service: ServiceMap,
	Incoming: PublicMethodMap,
	Outgoing: PublicMethodMap,
	PrivateIncoming: PrivateMethodMap,
	PrivateOutgoing: PrivateMethodMap,
	ServerState: object,
	State: object
}

export interface BasicServerMap<TIncoming extends PublicMethodMap = {}, TChannels extends ChannelMap = {}, TState extends object = {}, TOutgoing extends object = {}> {
	Channel: TChannels,
	Service: {},
	Incoming: TIncoming,
	Outgoing: TOutgoing,
	PrivateIncoming: ServerPrivateMap,
	PrivateOutgoing: ClientPrivateMap,
	ServerState: {},
	State: TState & ServerSocketState
}