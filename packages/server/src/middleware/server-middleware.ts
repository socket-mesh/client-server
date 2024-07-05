import { IncomingMessage } from "http";
import { ServerMap } from "../maps/server-map.js";
import { SocketMapFromServer } from "../maps/socket-map.js";
import { Middleware } from "@socket-mesh/client";
import { AuthInfo } from "../handlers/authenticate.js";
import { ServerSocket } from "../server-socket.js";
import { ServerTransport } from "../server-transport.js";
import { ChannelOptions } from "@socket-mesh/channels";

export interface HandshakeMiddlewareArgs<T extends ServerMap> {
	socket: ServerSocket<T>,
	transport: ServerTransport<T>	
	authInfo: AuthInfo
}

export interface PublishMiddlewareArgs<T extends ServerMap> {
	channel: string,
	data: any,
	socket: ServerSocket<T>,
	transport: ServerTransport<T>
}

export interface SubscribeMiddlewareArgs<T extends ServerMap> {
	channel: string,
	options: ChannelOptions,
	socket: ServerSocket<T>,
	transport: ServerTransport<T>
}

export interface ServerMiddleware<T extends ServerMap> extends Middleware<SocketMapFromServer<T>> {
	onAuthenticate?: (authInfo: AuthInfo) => void,
	onConnection?: (request: IncomingMessage) => Promise<void>,
	onHandshake?: (options: HandshakeMiddlewareArgs<T>) => Promise<void>,
	onPublishIn?: (options: PublishMiddlewareArgs<T>) => Promise<any>,
	onPublishOut?: (options: PublishMiddlewareArgs<T>) => Promise<any>,
	onSubscribe?: (options: SubscribeMiddlewareArgs<T>) => Promise<void>
};