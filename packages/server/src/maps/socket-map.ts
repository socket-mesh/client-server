import { ChannelMap } from "@socket-mesh/channels";
import { ClientPrivateMap, ServerPrivateMap } from "@socket-mesh/client";
import { PublicMethodMap } from "@socket-mesh/core";
import { ServerSocketState } from "../server-socket-state.js";
import { ServerMap } from "./server-map.js";


export interface BasicSocketMapServer<TIncoming extends PublicMethodMap = {}, TChannels extends ChannelMap = {}, TState extends object = {}, TOutgoing extends object = {}> {
	Incoming: TIncoming & ServerPrivateMap,
	Service: {},
	Outgoing: TOutgoing,
	PrivateOutgoing: ClientPrivateMap,
	State: TState & ServerSocketState
}

export interface SocketMapFromServer<T extends ServerMap> {
	Incoming: T['Incoming'] & T['PrivateIncoming'] & ServerPrivateMap,
	Service: T['Service'],
	Outgoing: T['Outgoing'],
	PrivateOutgoing: T['PrivateOutgoing'] & ClientPrivateMap,
	State: T['State'] & ServerSocketState
}