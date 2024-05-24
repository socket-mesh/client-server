import { HandlerMap } from "../client/maps/handler-map.js";
import { Socket, SocketOptions } from "../socket.js";
import ws from "ws";
import { ServerTransport } from "./server-transport.js";
import { ServerMap, SocketMapFromServer } from "../client/maps/socket-map.js";

export interface ServerSocketOptions<
	T extends ServerMap,
	TSocket extends Socket<SocketMapFromServer<T>>
> extends SocketOptions<SocketMapFromServer<T>> {
	handlers: HandlerMap<SocketMapFromServer<T>>,
	service?: string,
	socket: ws.WebSocket
}

export class ServerSocket<T extends ServerMap> extends Socket<SocketMapFromServer<T>> {
	private _serverTransport: ServerTransport<T>;

	constructor(options: ServerSocketOptions<T, ServerSocket<T>>) {
		const transport = new ServerTransport<T>(options);

		super(transport);

		this._serverTransport = transport;
	}

	get service(): string {
		return this._serverTransport.service;
	}
}