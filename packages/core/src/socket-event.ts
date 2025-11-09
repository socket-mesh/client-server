import { AuthToken, SignedAuthToken } from '@socket-mesh/auth';
import ws from 'isomorphic-ws';

import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from './maps/method-map.js';
import { MethodPacket, ServicePacket } from './packet.js';
import { AnyResponse } from './response.js';

export interface AuthenticatedChangeEvent {
	authToken: AuthToken | null,
	isAuthenticated: true,
	signedAuthToken: SignedAuthToken,
	wasAuthenticated: boolean
}

export interface AuthenticateEvent {
	authToken: AuthToken | null,
	signedAuthToken: SignedAuthToken,
	wasSigned: boolean
}

export type AuthStateChangeEvent = AuthenticatedChangeEvent | DeauthenticatedChangeEvent;

export interface BadAuthTokenEvent {
	error: Error,
	signedAuthToken: SignedAuthToken
}

export interface CloseEvent {
	code: number,
	reason?: string
}

export interface ConnectEvent {
	authError?: Error,
	id: null | string,
	isAuthenticated: boolean,
	pingTimeoutMs: number
}

export type ConnectingEvent = object;

export interface DeauthenticatedChangeEvent {
	isAuthenticated: false,
	wasAuthenticated: true
}

export interface DeauthenticateEvent {
	authToken: AuthToken | null,
	signedAuthToken: SignedAuthToken
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

export type PingEvent = object;

export type PongEvent = object;

export interface RemoveAuthTokenEvent {
	oldAuthToken: SignedAuthToken
}

export interface RequestEvent<
	TIncoming extends MethodMap,
	TService extends ServiceMap
> {
	request: MethodPacket<TIncoming> | ServicePacket<TService>
}

export interface ResponseEvent<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> {
	response: AnyResponse<TOutgoing, TPrivateOutgoing, TService>
}

export type SocketEvent<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> =
	AuthenticateEvent
	| AuthStateChangeEvent
	| BadAuthTokenEvent
	| CloseEvent
	| ConnectEvent
	| ConnectingEvent
	| DeauthenticateEvent
	| DisconnectEvent
	| ErrorEvent
	| MessageEvent
	| PingEvent
	| PongEvent
	| RemoveAuthTokenEvent
	| RequestEvent<TIncoming, TService>
	| ResponseEvent<TOutgoing, TPrivateOutgoing, TService>;
