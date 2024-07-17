import { SignedAuthToken } from "@socket-mesh/auth";
import { ChannelOptions, PublishOptions } from "@socket-mesh/channels";

export interface HandshakeOptions {
	authToken: SignedAuthToken
}

export type HandshakeStatus = HandshakeErrorStatus | HandshakeAuthenticatedStatus;

export interface HandshakeErrorStatus {
	id: string,
	pingTimeoutMs: number,
	authError: Error
}

export interface HandshakeAuthenticatedStatus {
	id: string,
	pingTimeoutMs: number,
	authToken: SignedAuthToken
}

export interface SubscribeOptions extends ChannelOptions {
	channel: string
}

// Typescript automatically adds an index signature to type definitions (vs interfaces). 
// If you add an index signature to an interface it has effects on IntelliSense.
export type ServerPrivateMap = {
	'#authenticate': (authToken: string) => void,
	'#handshake': (options: HandshakeOptions) => HandshakeStatus,
	'#publish': (options: PublishOptions) => void,
	'#removeAuthToken': () => void,
	'#subscribe': (options: SubscribeOptions) => void,
	'#unsubscribe': (channelName: string) => void
}