import { AnyPacket } from "../packet.js";
import { AnyRequest } from "../request.js";
import { AnyResponse } from "../response.js";
import { SocketTransport } from "../socket-transport.js";
import { Socket, SocketStatus } from "../socket.js";
import ws from "isomorphic-ws";
import { HandlerMap } from "../maps/handler-map.js";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "../maps/method-map.js";

export type PluginType = 'request' | 'response' | 'handshake';

export interface PluginArgs<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> {
	socket: Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>,
	transport: SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>
}

export interface DisconnectedPluginArgs<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> extends PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> {
	status: SocketStatus,
	code: number,
	reason?: string
}

export interface MessagePluginArgs<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> extends PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> {
	timestamp: Date,
	packet: AnyPacket<TIncoming, TService> | AnyResponse<TOutgoing, TPrivateOutgoing, TService>
}

export interface MessageRawPluginArgs<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> extends PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> {
	timestamp: Date,
	message: ws.RawData | string,
	promise: Promise<void>
}

export interface SendRequestPluginArgs<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> extends PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> {
	requests: AnyRequest<TOutgoing, TPrivateOutgoing, TService>[],
	cont: (requests: AnyRequest<TOutgoing, TPrivateOutgoing, TService>[]) => void
}

export interface SendResponsePluginArgs<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> extends PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> {
	responses: AnyResponse<TOutgoing, TPrivateOutgoing, TService>[],
	cont: (requests: AnyResponse<TOutgoing, TPrivateOutgoing, TService>[]) => void
}

export interface Plugin<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> {
	type: string,
	handlers?: HandlerMap<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>,
	onAuthenticated?(options: PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void,
	onClose?(options: PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void,
	onDeauthenticate?(options: PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void,
	onDisconnected?(options: DisconnectedPluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void,
	onEnd?(options: PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void,
	onMessage?(options: MessagePluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): Promise<AnyPacket<TIncoming, TService> | AnyResponse<TOutgoing, TPrivateOutgoing, TService>>,
	onMessageRaw?(options: MessageRawPluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): Promise<ws.RawData | string>,
	onOpen?(options: PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void,
	onReady?(options: PluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void,
	sendRequest?(options: SendRequestPluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void,
	sendResponse?(options: SendResponsePluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void
}