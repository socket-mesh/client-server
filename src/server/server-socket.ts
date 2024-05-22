import { MethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map.js";
import { HandlerMap } from "../client/maps/handler-map.js";
import { Socket, SocketOptions } from "../socket.js";
import ws from "ws";
import { ServerPrivateMap } from "../client/maps/server-private-map.js";
import { ServerSocketState } from "./server-socket-state.js";
import { ClientPrivateMap } from "../client/maps/client-private-map.js";
import { ServerTransport } from "./server-transport.js";
import { ChannelMap } from "../client/channels/channel-map.js";

export interface ServerSocketOptions<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TSocketState extends object,
	TSocket extends Socket<TIncomingMap & TPrivateIncomingMap & ServerPrivateMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>
> extends SocketOptions<TIncomingMap & TPrivateIncomingMap & ServerPrivateMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState> {
	handlers: HandlerMap<TIncomingMap & TPrivateIncomingMap & ServerPrivateMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>,
	service?: string,
	socket: ws.WebSocket
}

export class ServerSocket<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TChannelMap extends ChannelMap<TChannelMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> extends Socket<TIncomingMap & TPrivateIncomingMap & ServerPrivateMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState> {

	private _serverTransport: ServerTransport<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>;

	constructor(
		options:
			ServerSocketOptions<
				TIncomingMap,
				TServiceMap,
				TOutgoingMap,
				TPrivateIncomingMap,
				TPrivateOutgoingMap,
				TSocketState,
				ServerSocket<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>
			>
	) {
		const transport = new ServerTransport<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>(options);

		super(transport);

		this._serverTransport = transport;
	}

	get service(): string {
		return this._serverTransport.service;
	}
}