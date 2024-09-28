import { IncomingMessage } from "http";
import { Plugin, PrivateMethodMap, PublicMethodMap, ServiceMap } from "@socket-mesh/core";
import { AuthInfo } from "../handlers/authenticate.js";
import { ServerSocket } from "../server-socket.js";
import { ServerTransport } from "../server-transport.js";
import { ChannelMap, ChannelOptions } from "@socket-mesh/channels";
import { ClientPrivateMap, ServerPrivateMap } from "@socket-mesh/client";
import { ServerSocketState } from "../server-socket-state.js";

export interface HandshakePluginArgs<
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
	transport: ServerTransport<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>	
	authInfo: AuthInfo
}

export interface PublishPluginArgs<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> {
	channel: string,
	data: any,
	socket: ServerSocket<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>,
	transport: ServerTransport<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>
}

export interface SubscribePluginArgs<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> {
	channel: string,
	options: ChannelOptions,
	socket: ServerSocket<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>,
	transport: ServerTransport<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>
}

export interface ServerPlugin<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> extends Plugin<
	TIncoming & TPrivateIncoming & ServerPrivateMap,
	TOutgoing,
	TPrivateOutgoing & ClientPrivateMap,
	TService,
	TState & ServerSocketState
> {
	onAuthenticate?: (authInfo: AuthInfo) => void,
	onConnection?: (request: IncomingMessage) => Promise<void>,
	onHandshake?: (options: HandshakePluginArgs<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>) => Promise<void>,
	onPublishIn?: (options: PublishPluginArgs<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>) => Promise<any>,
	onPublishOut?: (options: PublishPluginArgs<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>) => Promise<any>,
	onSubscribe?: (options: SubscribePluginArgs<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>) => Promise<void>
};