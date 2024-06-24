import { HandlerMap } from "../client/maps/handler-map.js";
import { Socket, SocketOptions } from "../socket.js";
import ws from "ws";
import { ServerTransport } from "./server-transport.js";
import { SocketMapFromServer } from "../client/maps/socket-map.js";
import { ServerMap } from "../client/maps/server-map.js";
import { Exchange } from "./broker/exchange.js";
import { Server } from "./server.js";

export interface ServerSocketOptions<T extends ServerMap> extends SocketOptions<SocketMapFromServer<T>> {
	handlers: HandlerMap<SocketMapFromServer<T>>,
	service?: string,
	server: Server<T>,
	socket: ws.WebSocket
}

export class ServerSocket<T extends ServerMap> extends Socket<SocketMapFromServer<T>> {
	public readonly server: Server<T>;
	private _serverTransport: ServerTransport<T>;

	constructor(options: ServerSocketOptions<T>) {
		const transport = new ServerTransport<T>(options);

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

	kickOut(channel: string, message: string): Promise<void[]> {
		const channels = channel ? [channel] : Object.keys(this.state.channelSubscriptions);

		return Promise.all(channels.map((channelName) => {
			this.transmit('#kickOut', { channel: channelName, message });
			return this._serverTransport.unsubscribe(channelName);
		}));
	}

	public get exchange(): Exchange<T['Channel']> {
		return this.server.exchange;
	}

	get service(): string {
		return this._serverTransport.service;
	}

	get type(): 'server' {
		return this._serverTransport.type;
	}
}