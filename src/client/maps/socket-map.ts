import { ServerSocketState } from "../../server/server-socket-state.js";
import { ChannelMap } from "../channels/channel-map.js";
import { ClientPrivateMap } from "./client-private-map.js";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./method-map.js";
import { ServerPrivateMap } from "./server-private-map.js";

export interface SocketMap {
	Incoming: MethodMap,
	Service: ServiceMap,
	Outgoing: PublicMethodMap,
	PrivateOutgoing: PrivateMethodMap,
	State: object
}

export interface ClientMap {
	Channel: ChannelMap,
	Incoming: MethodMap,
	Service: ServiceMap,
	Outgoing: PublicMethodMap,
	PrivateOutgoing: PrivateMethodMap,
	State: object
}

export interface SocketMapFromClient<T extends SocketMap> {
	Incoming: T['Incoming'] & ClientPrivateMap,
	Service: T['Service'],
	Outgoing: T['Outgoing'],
	PrivateOutgoing: T['PrivateOutgoing'] & ServerPrivateMap,
	State: T['State']
}

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

export interface SocketMapFromServer<T extends ServerMap> {
	Incoming: T['Incoming'] & T['PrivateIncoming'] & ServerPrivateMap,
	Service: T['Service'],
	Outgoing: T['Outgoing'],
	PrivateOutgoing: T['PrivateOutgoing'] & ClientPrivateMap,
	State: T['State'] & ServerSocketState<T>
}

export interface ClientMapFromServer<T extends ServerMap> {
	Channel: T['Channel'],
	Incoming: T['Outgoing'] & T['PrivateOutgoing'],
	Service: T['Service'],
	Outgoing: PublicMethodMap,
	PrivateOutgoing: T['PrivateIncoming'],
	State: object
}

export interface SocketMapClientFromServer<T extends ServerMap> {
	Incoming: T['Outgoing'] & T['PrivateOutgoing'] & ServerPrivateMap,
	Service: T['Service'],
	Outgoing: T['Incoming'],
	PrivateOutgoing: T['PrivateIncoming'] & ClientPrivateMap,
	State: T['State'] & ServerSocketState<T>
}

export interface EmptyServerMap {
	Channel: {},
	Service: {},
	Incoming: {},
	Outgoing: {},
	PrivateIncoming: ServerPrivateMap,
	PrivateOutgoing: ClientPrivateMap,
	ServerState: {},
	State: {}
}

export interface EmptySocketMap {
	Incoming: {},
	Service: {},
	Outgoing: {},
	PrivateOutgoing: {},
	State: {}
}

export interface EmptySocketMapServer {
	Incoming: {},
	Service: {},
	Outgoing: {},
	PrivateOutgoing: ClientPrivateMap,
	State: ServerSocketState<EmptyServerMap>
}

export interface EmptySocketMapClient {
	Incoming: ClientPrivateMap,
	Service: {},
	Outgoing: {},
	PrivateOutgoing: ServerPrivateMap,
	State: {}
}