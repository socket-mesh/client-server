import ws from "isomorphic-ws";
import { ClientRequest, IncomingMessage } from "http";
import { MethodPacket, ServicePacket } from "./request.js";
import { PublicMethodMap, ServiceMap, MethodMap, PrivateMethodMap } from "./client/maps/method-map.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { AnyResponse } from "./response.js";
import { ChannelState } from "./channels/channel-state.js";
import { ChannelOptions } from "./channels/channel-options.js";
import { SocketMap } from "./client/maps/socket-map.js";

export type SocketEvent<T extends SocketMap> =
	AuthStateChangeEvent |
	RemoveAuthTokenEvent |
	AuthenticateEvent |
	BadAuthTokenEvent |
	CloseEvent |
	ConnectEvent |
	ConnectingEvent |
	DeauthenticateEvent |
	DisconnectEvent | 
	ErrorEvent |
	MessageEvent |
	PingEvent |
	PongEvent |
	RequestEvent<T['Service'], T['Incoming']> |
	ResponseEvent<T['Service'], T['Outgoing'], T['PrivateOutgoing']> |
	UnexpectedResponseEvent |
	UpgradeEvent;

export type AuthStateChangeEvent = AuthenticatedChangeEvent | DeauthenticatedChangeEvent;

export interface AuthenticatedChangeEvent {
	isAuthenticated: true,
	wasAuthenticated: boolean,
	signedAuthToken: SignedAuthToken,
	authToken: AuthToken
}

export interface AuthenticateEvent {
	wasSigned: boolean,
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
	id: string,
	isAuthenticated: boolean,
	pingTimeoutMs: number,
	authError?: Error
}

export interface ConnectingEvent {
}

export interface DeauthenticateEvent {
	signedAuthToken: SignedAuthToken,
	authToken: AuthToken
}

export interface DeauthenticatedChangeEvent {
	isAuthenticated: false,
	wasAuthenticated: true
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

export interface UnexpectedResponseEvent {
	request: ClientRequest,
	response: IncomingMessage
}

export interface UpgradeEvent {
	request: IncomingMessage
}