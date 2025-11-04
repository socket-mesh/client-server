import { SignedAuthToken } from '@socket-mesh/auth';
import { ChannelOptions, PublishOptions } from '@socket-mesh/channels';

export interface HandshakeAuthenticatedStatus {
	authToken: SignedAuthToken,
	id: string,
	pingTimeoutMs: number
}

export interface HandshakeErrorStatus {
	authError: Error,
	id: string,
	pingTimeoutMs: number
}

export interface HandshakeOptions {
	authToken: SignedAuthToken
}

export type HandshakeStatus = HandshakeAuthenticatedStatus | HandshakeErrorStatus;

// Typescript automatically adds an index signature to type definitions (vs interfaces).
// If you add an index signature to an interface it has effects on IntelliSense.
export interface ServerPrivateMap {
	'#authenticate': (authToken: string) => void,
	'#handshake': (options: HandshakeOptions) => HandshakeStatus,
	'#publish': (options: PublishOptions) => void,
	'#removeAuthToken': () => void,
	'#subscribe': (options: SubscribeOptions) => void,
	'#unsubscribe': (channelName: string) => void
}

export interface SubscribeOptions extends ChannelOptions {
	channel: string
}
