import { HandlerMap } from "../client/maps/handler-map.js";
import { Socket, SocketOptions } from "../socket.js";
import ws from "ws";
import { ServerTransport } from "./server-transport.js";
import { SocketMapFromServer } from "../client/maps/socket-map.js";
import { ServerMap } from "../client/maps/server-map.js";
import { AuthTokenOptions } from "./auth-engine.js";

export interface ServerSocketOptions<
	T extends ServerMap
> extends SocketOptions<SocketMapFromServer<T>> {
	handlers: HandlerMap<SocketMapFromServer<T>>,
	service?: string,
	socket: ws.WebSocket
}

export class ServerSocket<T extends ServerMap> extends Socket<SocketMapFromServer<T>> {
	private _serverTransport: ServerTransport<T>;

	constructor(options: ServerSocketOptions<T>) {
		const transport = new ServerTransport<T>(options);

		super(transport);

		this._serverTransport = transport;
	}

	async deauthenticate(options?: AuthTokenOptions): Promise<boolean> {
		await super.deauthenticate();
		
		if (options && options.rejectOnFailedDelivery) {
			try {
				await this._serverTransport.invoke('#removeAuthToken', undefined, true)[0];
			} catch (error) {
				this._serverTransport.onError(error);
				if (options && options.rejectOnFailedDelivery) {
					throw error;
				}
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

	get service(): string {
		return this._serverTransport.service;
	}
}