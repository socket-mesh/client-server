import ws from "isomorphic-ws";
import { ClientRequest, IncomingMessage } from "http";
import { MethodPacket, ServicePacket } from "./request.js";
import { PublicMethodMap, ServiceMap, MethodMap, PrivateMethodMap } from "./client/maps/method-map.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { AnyResponse } from "./response.js";
import { ChannelState } from "./client/channels/channel-state.js";
import { ChannelOptions } from "./client/channels/channel-options.js";
import { SocketMap } from "./client/maps/socket-map.js";

export type SocketEvent<T extends SocketMap> =
	AuthStateChangeEvent |
	RemoveAuthTokenEvent |
	AuthenticationEvent |
	BadAuthTokenEvent |
	CloseEvent |
	ErrorEvent |
	MessageEvent |
	ConnectEvent |
	ConnectingEvent |
	DisconnectEvent | 
	PingEvent |
	PongEvent |
	RequestEvent<T['Service'], T['Incoming']> |
	ResponseEvent<T['Service'], T['Outgoing'], T['PrivateOutgoing']> |
	SubscribeEvent |
	SubscribeFailEvent |
	SubscribeStateChangeEvent |
	UnsubscribeEvent |
	UnexpectedResponseEvent |
	UpgradeEvent;

export type AuthStateChangeEvent = AuthenticatedChangeEvent | DeauthenticatedChangeEvent;

export interface AuthenticatedChangeEvent {
	isAuthenticated: true,
	wasAuthenticated: boolean,
	signedAuthToken: SignedAuthToken,
	authToken: AuthToken
}

export interface AuthenticationEvent {
	signedAuthToken: SignedAuthToken,
	authToken: AuthToken
}

export interface BadAuthTokenEvent {
	error: Error,
	signedAuthToken: SignedAuthToken
}

export interface CloseEvent {
	code: number,
	reason?: string
}

export interface ConnectEvent {
	isAuthenticated: boolean
}

export interface ConnectingEvent {
}

export interface DeauthenticatedChangeEvent {
	isAuthenticated: false,
	wasAuthenticated: true,
	signedAuthToken: SignedAuthToken,
	authToken: AuthToken
}

export interface DisconnectEvent {
	code: number,
	reason?: string
}

export interface ErrorEvent {
	error: Error
}

export interface MessageEvent {
	data: ws.RawData,
	isBinary: boolean
}

export interface PingEvent {
	data: Buffer
}

export interface PongEvent {
	data: Buffer
}

export interface RemoveAuthTokenEvent {
	oldAuthToken: SignedAuthToken
}

export interface RequestEvent<TServiceMap extends ServiceMap, TIncomingMap extends MethodMap> {
	request: ServicePacket<TServiceMap> | MethodPacket<TIncomingMap>
}

export interface ResponseEvent<
	TServiceMap extends ServiceMap,
	TOutgoingMap extends PublicMethodMap,
	TPrivateOutgoingMap extends PrivateMethodMap
> {
	response: AnyResponse<TServiceMap, TOutgoingMap, TPrivateOutgoingMap>
}

export interface SubscribeEvent {
	channel: string,
	options: ChannelOptions
}

export interface SubscribeFailEvent {
	channel: string,
	options: ChannelOptions,
	error: Error
}

export interface SubscribeStateChangeEvent {
	channel: string,
	oldState: ChannelState,
	newState: ChannelState
}

export interface UnexpectedResponseEvent {
	request: ClientRequest,
	response: IncomingMessage
}

export interface UnsubscribeEvent {
	channel: string
}

export interface UpgradeEvent {
	request: IncomingMessage
}