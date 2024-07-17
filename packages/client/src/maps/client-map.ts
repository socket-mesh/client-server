import { SignedAuthToken } from "@socket-mesh/auth";
import { ChannelMap, PublishOptions } from "@socket-mesh/channels";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "@socket-mesh/core";

export interface ClientMap {
	Channel: ChannelMap,
	Incoming: MethodMap,
	Service: ServiceMap,
	Outgoing: PublicMethodMap,
	PrivateOutgoing: PrivateMethodMap,
	State: object
}

export interface KickOutOptions {
	channel: string,
	message: string
}

// Typescript automatically adds an index signature to type definitions (vs interfaces). 
// If you add an index signature to an interface it has effects on IntelliSense.
export type ClientPrivateMap = {
	'#kickOut': (options: KickOutOptions) => void,
	'#setAuthToken': (token: SignedAuthToken) => void,
	'#removeAuthToken': () => void,
	'#publish': (options: PublishOptions) => void
}