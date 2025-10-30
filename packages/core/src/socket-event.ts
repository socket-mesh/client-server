import ws from "isomorphic-ws";
import { MethodPacket, ServicePacket } from "./packet.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { AnyResponse } from "./response.js";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./maps/method-map.js";

export type SocketEvent<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> =
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
	RequestEvent<TIncoming, TService> |
	ResponseEvent<TOutgoing, TPrivateOutgoing, TService>;

export type AuthStateChangeEvent = AuthenticatedChangeEvent | DeauthenticatedChangeEvent;

export interface AuthenticatedChangeEvent {
	isAuthenticated: true,
	wasAuthenticated: boolean,
	signedAuthToken: SignedAuthToken,
	authToken: AuthToken | null
}

export interface AuthenticateEvent {
	wasSigned: boolean,
	signedAuthToken: SignedAuthToken,
	authToken: AuthToken | null
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
	id: string | null,
	isAuthenticated: boolean,
	pingTimeoutMs: number,
	authError?: Error
}

export interface ConnectingEvent {
}

export interface DeauthenticateEvent {
	signedAuthToken: SignedAuthToken,
	authToken: AuthToken | null
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
	data: string | ws.RawData,
	isBinary: boolean
}

export interface PingEvent {}

export interface PongEvent {}

export interface RemoveAuthTokenEvent {
	oldAuthToken: SignedAuthToken
}

export interface RequestEvent<
	TIncoming extends MethodMap,
	TService extends ServiceMap
> {
	request: ServicePacket<TService> | MethodPacket<TIncoming>
}

export interface ResponseEvent<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> {
	response: AnyResponse<TOutgoing, TPrivateOutgoing, TService>
}