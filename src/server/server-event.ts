import { IncomingMessage } from "http";
import { ClientSocket } from "../client/client-socket";
import { ServerSocket } from "./server-socket";
import { MethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map";
import { ServerSocketState } from "./server-socket-state";
import { ClientPrivateMap } from "../client/maps/client-private-map";
import { ServerPrivateMap } from "../client/maps/server-private-map";
import {
	AuthenticationEvent, BadAuthTokenEvent, ConnectEvent, CloseEvent as SCloseEvent, DisconnectEvent, ErrorEvent as SErrorEvent,
	MessageEvent, PingEvent, PongEvent, RequestEvent, ResponseEvent, UnexpectedResponseEvent, UpgradeEvent,
	AuthenticatedChangeEvent,
	ConnectingEvent,
	RemoveAuthTokenEvent,
	UnsubscribeEvent,
	SubscribeStateChangeEvent,
	SubscribeEvent,
	SubscribeFailEvent
} from "../socket-event";
import { ChannelMap } from "../client/channels/channel-map";

export type ServerEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> =
	ConnectionEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	CloseEvent |
	ErrorEvent |
	HeadersEvent |
	ListeningEvent |
	SocketAuthenticatedChangeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketAuthenticationEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketBadAuthTokenEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketCloseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketErrorEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketMessageEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketConnectEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketConnectingEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketDisconnectEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketPingEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketPongEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketRemoveAuthTokenEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketRequestEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketResponseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketUnexpectedResponseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState> |
	SocketUpgradeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

	export interface ConnectionEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> {
	socket:
		ClientSocket<TOutgoingMap, TChannelMap, TServiceMap, TSocketState, TIncomingMap, TPrivateIncomingMap & ServerPrivateMap> |
		ServerSocket<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>,
	upgradeReq: IncomingMessage
}


export interface CloseEvent {}

export interface ErrorEvent {
	error: Error
}

export interface HeadersEvent {
	headers: string[],
	request: IncomingMessage
}

export interface ListeningEvent {}

export interface ServerSocketEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> {
	socket:
		ClientSocket<TOutgoingMap, TChannelMap, TServiceMap, TSocketState, TIncomingMap, TPrivateIncomingMap & ServerPrivateMap> |
		ServerSocket<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>
}

export type SocketAuthenticatedChangeEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = AuthenticatedChangeEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketAuthenticationEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = AuthenticationEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketBadAuthTokenEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = BadAuthTokenEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketCloseEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = SCloseEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketErrorEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = SErrorEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketMessageEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = MessageEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketConnectEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = ConnectEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketConnectingEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = ConnectingEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketDisconnectEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = DisconnectEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketPingEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = PingEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketPongEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = PongEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketRemoveAuthTokenEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = RemoveAuthTokenEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketRequestEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = RequestEvent<TServiceMap, TIncomingMap> & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketResponseEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = ResponseEvent<TServiceMap, TOutgoingMap, TPrivateOutgoingMap> & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketSubscribeEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = SubscribeEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketSubscribeFailEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = SubscribeFailEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketSubscribeStateChangeEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = SubscribeStateChangeEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketUnsubscribeEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = UnsubscribeEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketUnexpectedResponseEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = UnexpectedResponseEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;

export type SocketUpgradeEvent<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> = UpgradeEvent & ServerSocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>;
