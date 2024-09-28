import { SignedAuthToken } from "@socket-mesh/auth";
import { PublishOptions } from "@socket-mesh/channels";

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