import { ClientMap, ClientPrivateMap } from "./client-map.js";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./method-map.js";
import { ServerPrivateMap } from "./server-map.js";

export interface SocketMap {
	Incoming: MethodMap,
	Service: ServiceMap,
	Outgoing: PublicMethodMap,
	PrivateOutgoing: PrivateMethodMap,
	State: object
}

export interface EmptySocketMap {
	Incoming: {},
	Service: {},
	Outgoing: {},
	PrivateOutgoing: {},
	State: {}
}

export interface SocketMapFromClient<T extends ClientMap> {
	Incoming: T['Incoming'] & ClientPrivateMap,
	Service: T['Service'],
	Outgoing: T['Outgoing'],
	PrivateOutgoing: T['PrivateOutgoing'] & ServerPrivateMap,
	State: T['State']
}



export interface BasicSocketMapClient<TOutgoing extends PublicMethodMap = {}, TState extends object = {}> {
	Incoming: ClientPrivateMap,
	Service: {},
	Outgoing: TOutgoing,
	PrivateOutgoing: ServerPrivateMap,
	State: TState
}