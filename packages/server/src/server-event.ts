import { IncomingMessage } from "http";
import { ClientSocket, ServerPrivateMap } from "@socket-mesh/client";
import { ServerSocket } from "./server-socket.js";
import {
	AuthenticateEvent, BadAuthTokenEvent, ConnectEvent, CloseEvent as SCloseEvent, DisconnectEvent, ErrorEvent as SErrorEvent,
	MessageEvent, PingEvent, PongEvent, RequestEvent, ResponseEvent, ConnectingEvent, RemoveAuthTokenEvent, DeauthenticateEvent,
	AuthStateChangeEvent,
	ServiceMap,
	PublicMethodMap,
	PrivateMethodMap
} from "@socket-mesh/core";
import { ChannelMap, SubscribeEvent, SubscribeFailEvent, SubscribeStateChangeEvent, UnsubscribeEvent } from "@socket-mesh/channels";

export type ServerEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> =
	ConnectionEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	CloseEvent |
	ErrorEvent |
	HeadersEvent |
	HandshakeEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	ListeningEvent |
	SocketAuthStateChangeEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketAuthenticateEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketBadAuthTokenEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketCloseEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketDeauthenticateEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketErrorEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketMessageEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketConnectEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketConnectingEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketDisconnectEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketPingEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketPongEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketRemoveAuthTokenEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	SocketRequestEvent<TService, TIncoming, TPrivateIncoming> |
	SocketResponseEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> |
	WarningEvent;

export interface ConnectionEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> {
	socket: ServerSocket<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>,
	upgradeReq: IncomingMessage
}


export interface CloseEvent {}

export interface ErrorEvent {
	error: Error
}

export interface HandshakeEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> {
	socket: ServerSocket<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>
}

export interface WarningEvent {
	warning: Error
}

export interface HeadersEvent {
	headers: string[],
	request: IncomingMessage
}

export interface ListeningEvent {}

export interface ServerSocketEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> {
	socket:
		ClientSocket<PublicMethodMap, TChannel, TService, TState, TOutgoing & TPrivateOutgoing, TPrivateIncoming> |
		ServerSocket<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>
}

export type SocketAuthStateChangeEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = AuthStateChangeEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketAuthenticateEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = AuthenticateEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketBadAuthTokenEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = BadAuthTokenEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketCloseEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = SCloseEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketDeauthenticateEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = DeauthenticateEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketErrorEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = SErrorEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketMessageEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = MessageEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketConnectEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = ConnectEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketConnectingEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = ConnectingEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketDisconnectEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = DisconnectEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketPingEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = PingEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketPongEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = PongEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketRemoveAuthTokenEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = RemoveAuthTokenEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketRequestEvent<
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
> = RequestEvent<TIncoming & TPrivateIncoming & ServerPrivateMap, TService>;

export type SocketResponseEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = ResponseEvent<TOutgoing, TPrivateOutgoing, TService> &
	ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketSubscribeEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = SubscribeEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketSubscribeFailEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = SubscribeFailEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketSubscribeStateChangeEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = SubscribeStateChangeEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

export type SocketUnsubscribeEvent<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> = UnsubscribeEvent & ServerSocketEvent<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;
