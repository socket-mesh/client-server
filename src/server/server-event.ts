import { IncomingMessage } from "http";
import { ClientSocket } from "../client/client-socket.js";
import { ServerSocket } from "./server-socket.js";
import {
	AuthenticateEvent, BadAuthTokenEvent, ConnectEvent, CloseEvent as SCloseEvent, DisconnectEvent, ErrorEvent as SErrorEvent,
	MessageEvent, PingEvent, PongEvent, RequestEvent, ResponseEvent, UnexpectedResponseEvent, UpgradeEvent,
	ConnectingEvent,
	RemoveAuthTokenEvent,
	DeauthenticateEvent,
	AuthStateChangeEvent
} from "../socket-event.js";
import { ServerMap } from "../client/maps/server-map.js";
import { ClientMapFromServer } from "../client/maps/client-map.js";
import { SubscribeEvent, SubscribeFailEvent, SubscribeStateChangeEvent, UnsubscribeEvent } from "../channels/channel-events.js";

export type ServerEvent<T extends ServerMap> =
	ConnectionEvent<T> |
	CloseEvent |
	ErrorEvent |
	HeadersEvent |
	ListeningEvent |
	SocketAuthStateChangeEvent<T> |
	SocketAuthenticateEvent<T> |
	SocketBadAuthTokenEvent<T> |
	SocketCloseEvent<T> |
	SocketDeauthenticateEvent<T> |
	SocketErrorEvent<T> |
	SocketMessageEvent<T> |
	SocketConnectEvent<T> |
	SocketConnectingEvent<T> |
	SocketDisconnectEvent<T> |
	SocketPingEvent<T> |
	SocketPongEvent<T> |
	SocketRemoveAuthTokenEvent<T> |
	SocketRequestEvent<T> |
	SocketResponseEvent<T> |
	SocketUnexpectedResponseEvent<T> |
	SocketUpgradeEvent<T> |
	WarningEvent;

export interface ConnectionEvent<T extends ServerMap> {
	socket: ServerSocket<T>,
	upgradeReq: IncomingMessage
}


export interface CloseEvent {}

export interface ErrorEvent {
	error: Error
}

export interface WarningEvent {
	warning: Error
}

export interface HeadersEvent {
	headers: string[],
	request: IncomingMessage
}

export interface ListeningEvent {}

export interface ServerSocketEvent<T extends ServerMap> {
	socket: ClientSocket<ClientMapFromServer<T>> | ServerSocket<T>
}

export type SocketAuthStateChangeEvent<T extends ServerMap> = AuthStateChangeEvent & ServerSocketEvent<T>;

export type SocketAuthenticateEvent<T extends ServerMap> = AuthenticateEvent & ServerSocketEvent<T>;

export type SocketBadAuthTokenEvent<T extends ServerMap> = BadAuthTokenEvent & ServerSocketEvent<T>;

export type SocketCloseEvent<T extends ServerMap> = SCloseEvent & ServerSocketEvent<T>;

export type SocketDeauthenticateEvent<T extends ServerMap> = DeauthenticateEvent & ServerSocketEvent<T>;

export type SocketErrorEvent<T extends ServerMap> = SErrorEvent & ServerSocketEvent<T>;

export type SocketMessageEvent<T extends ServerMap> = MessageEvent & ServerSocketEvent<T>;

export type SocketConnectEvent<T extends ServerMap> = ConnectEvent & ServerSocketEvent<T>;

export type SocketConnectingEvent<T extends ServerMap> = ConnectingEvent & ServerSocketEvent<T>;

export type SocketDisconnectEvent<T extends ServerMap> = DisconnectEvent & ServerSocketEvent<T>;

export type SocketPingEvent<T extends ServerMap> = PingEvent & ServerSocketEvent<T>;

export type SocketPongEvent<T extends ServerMap> = PongEvent & ServerSocketEvent<T>;

export type SocketRemoveAuthTokenEvent<T extends ServerMap> = RemoveAuthTokenEvent & ServerSocketEvent<T>;

export type SocketRequestEvent<T extends ServerMap> = RequestEvent<T['Service'], T['Incoming']> & ServerSocketEvent<T>;

export type SocketResponseEvent<T extends ServerMap> = ResponseEvent<T['Service'], T['Outgoing'], T['PrivateOutgoing']> & ServerSocketEvent<T>;

export type SocketSubscribeEvent<T extends ServerMap> = SubscribeEvent & ServerSocketEvent<T>;

export type SocketSubscribeFailEvent<T extends ServerMap> = SubscribeFailEvent & ServerSocketEvent<T>;

export type SocketSubscribeStateChangeEvent<T extends ServerMap> = SubscribeStateChangeEvent & ServerSocketEvent<T>;

export type SocketUnsubscribeEvent<T extends ServerMap> = UnsubscribeEvent & ServerSocketEvent<T>;

export type SocketUnexpectedResponseEvent<T extends ServerMap> = UnexpectedResponseEvent & ServerSocketEvent<T>;

export type SocketUpgradeEvent<T extends ServerMap> = UpgradeEvent & ServerSocketEvent<T>;
