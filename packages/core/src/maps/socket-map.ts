import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./method-map.js";

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