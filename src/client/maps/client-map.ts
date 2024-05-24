import { SignedAuthToken } from "@socket-mesh/auth"
import { ChannelMap } from "../channels/channel-map.js"
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./method-map.js"
import { ServerMap } from "./server-map.js"

export interface ClientMap {
	Channel: ChannelMap,
	Incoming: MethodMap,
	Service: ServiceMap,
	Outgoing: PublicMethodMap,
	PrivateOutgoing: PrivateMethodMap,
	State: object
}

export interface ClientMapFromServer<T extends ServerMap> {
	Channel: T['Channel'],
	Incoming: T['Outgoing'] & T['PrivateOutgoing'],
	Service: T['Service'],
	Outgoing: PublicMethodMap,
	PrivateOutgoing: T['PrivateIncoming'],
	State: object
}

// Typescript automatically adds an index signature to type definitions (vs interfaces). 
// If you add an index signature to an interface it has effects on IntelliSense.
export type ClientPrivateMap = {
	'#setAuthToken': (token: SignedAuthToken) => void,
	'#removeAuthToken': () => void
}