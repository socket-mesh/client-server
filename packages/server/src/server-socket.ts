import { HandlerMap, PrivateMethodMap, PublicMethodMap, ServiceMap, Socket, SocketOptions } from "@socket-mesh/core";
import ws from "ws";
import { ServerTransport } from "./server-transport.js";
import { Exchange } from "./broker/exchange.js";
import { Server } from "./server.js";
import { IncomingMessage } from "http";
import { ServerPlugin } from "./plugin/server-plugin.js";
import { ChannelMap } from "@socket-mesh/channels";
import { ServerSocketState } from "./server-socket-state.js";
import { ClientPrivateMap, ServerPrivateMap } from "@socket-mesh/client";

export interface ServerSocketOptions<
	TIncoming extends PublicMethodMap,
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
> extends SocketOptions<
	TIncoming & TPrivateIncoming & ServerPrivateMap,
	TOutgoing,
	TPrivateOutgoing & ClientPrivateMap,
	TService,
	TState & ServerSocketState
> {
	handlers: HandlerMap<
		TIncoming & TPrivateIncoming & ServerPrivateMap,
		TOutgoing,
		TPrivateOutgoing & ClientPrivateMap,
		TService,
		TState & ServerSocketState
	>,
	plugins?: ServerPlugin<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>[],
	id?: string,
	service?: string,
	server: Server<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>,
	request: IncomingMessage,
	socket: ws.WebSocket
}

export class ServerSocket<
	TIncoming extends PublicMethodMap = {},
	TChannel extends ChannelMap = {},
	TService extends ServiceMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateIncoming extends PrivateMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TServerState extends object = {},
	TState extends object = {}
> extends Socket<
	TIncoming & TPrivateIncoming & ServerPrivateMap,
	TOutgoing,
	TPrivateOutgoing & ClientPrivateMap,
	TService,
	TState & ServerSocketState
> {
	public readonly server: Server<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;
	private _serverTransport: ServerTransport<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;

	constructor(options: ServerSocketOptions<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>) {
		const transport = new ServerTransport<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>(options);

		super(transport, options);

		this.server = options.server;
		this._serverTransport = transport;
	}

	async deauthenticate(rejectOnFailedDelivery?: boolean): Promise<boolean> {
		await super.deauthenticate();
		
		if (rejectOnFailedDelivery) {
			try {
				await this._serverTransport.invoke('#removeAuthToken', undefined)[0];
			} catch (error) {
				this._serverTransport.onError(error);
				throw error;
			}
			return;
		}

		try {
			await this.transmit('#removeAuthToken');
		} catch (err) {
			if (err.name !== 'BadConnectionError') {
				throw err;
			}
		}
	}

	public get exchange(): Exchange<TChannel> {
		return this.server.exchange;
	}

	kickOut(channel: string, message: string): Promise<void[]> {
		const channels = channel ? [channel] : Object.keys(this.state.channelSubscriptions);

		return Promise.all(channels.map((channelName) => {
			this.transmit('#kickOut', { channel: channelName, message });
			return this._serverTransport.unsubscribe(channelName);
		}));
	}

	public ping(): Promise<void> {
		return this._serverTransport.ping();
	}

	get service(): string {
		return this._serverTransport.service;
	}

	get type(): 'server' {
		return this._serverTransport.type;
	}
}