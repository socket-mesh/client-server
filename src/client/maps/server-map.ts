import { SignedAuthToken } from "@socket-mesh/auth";
import { ChannelOptions } from "../channels/channel-options.js";
import { ChannelMap } from "../channels/channel-map.js";
import { PrivateMethodMap, PublicMethodMap, ServiceMap } from "./method-map.js";
import { ClientPrivateMap } from "./client-map.js";

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

export interface BasicServerMap<TIncoming extends PublicMethodMap = {}, TChannels extends ChannelMap = {}, TState extends object = {}> {
	Channel: TChannels,
	Service: {},
	Incoming: TIncoming,
	Outgoing: {},
	PrivateIncoming: ServerPrivateMap,
	PrivateOutgoing: ClientPrivateMap,
	ServerState: {},
	State: TState
}

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

export interface PublishOptions {
	channel: string,
	data: any
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