import ws from "isomorphic-ws";
import { ClientRequest, IncomingMessage } from "http";
import { MethodPacket, ServicePacket } from "./request.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { AnyResponse } from "./response.js";
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
	RequestEvent<T> |
	ResponseEvent<T> |
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

export interface RequestEvent<T extends SocketMap> {
	request: ServicePacket<T['Service']> | MethodPacket<T['Incoming']>
}

export interface ResponseEvent<T extends SocketMap> {
	response: AnyResponse<T>
}

export interface UnexpectedResponseEvent {
	request: ClientRequest,
	response: IncomingMessage
}

export interface UpgradeEvent {
	request: IncomingMessage
}