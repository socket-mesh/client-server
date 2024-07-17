import { ClientMap, ClientPrivateMap } from "./client-map.js";
import { PublicMethodMap } from "@socket-mesh/core";
import { ServerPrivateMap } from "./server-map.js";

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