import { IncomingMessage } from "http";
import { ServerMap } from "../maps/server-map.js";
import { SocketMapFromServer } from "../maps/socket-map.js";
import { Plugin } from "@socket-mesh/client";
import { AuthInfo } from "../handlers/authenticate.js";
import { ServerSocket } from "../server-socket.js";
import { ServerTransport } from "../server-transport.js";
import { ChannelOptions } from "@socket-mesh/channels";

export interface HandshakePluginArgs<T extends ServerMap> {
	socket: ServerSocket<T>,
	transport: ServerTransport<T>	
	authInfo: AuthInfo
}

export interface PublishPluginArgs<T extends ServerMap> {
	channel: string,
	data: any,
	socket: ServerSocket<T>,
	transport: ServerTransport<T>
}

export interface SubscribePluginArgs<T extends ServerMap> {
	channel: string,
	options: ChannelOptions,
	socket: ServerSocket<T>,
	transport: ServerTransport<T>
}

export interface ServerPlugin<T extends ServerMap> extends Plugin<SocketMapFromServer<T>> {
	onAuthenticate?: (authInfo: AuthInfo) => void,
	onConnection?: (request: IncomingMessage) => Promise<void>,
	onHandshake?: (options: HandshakePluginArgs<T>) => Promise<void>,
	onPublishIn?: (options: PublishPluginArgs<T>) => Promise<any>,
	onPublishOut?: (options: PublishPluginArgs<T>) => Promise<any>,
	onSubscribe?: (options: SubscribePluginArgs<T>) => Promise<void>
};