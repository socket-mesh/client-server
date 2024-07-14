import { EmptySocketMap, SocketMap } from "../maps/socket-map.js";
import { AnyPacket } from "../core/packet.js";
import { AnyRequest } from "../core/request.js";
import { AnyResponse } from "../core/response.js";
import { SocketTransport } from "../core/socket-transport.js";
import { Socket, SocketStatus } from "../core/socket.js";
import ws from "isomorphic-ws";
import { HandlerMap } from "../maps/handler-map.js";

export type PluginType = 'request' | 'response' | 'handshake';

export interface PluginArgs<T extends SocketMap = EmptySocketMap> {
	socket: Socket<T>,
	transport: SocketTransport<T>
}

export interface DisconnectedPluginArgs<T extends SocketMap = EmptySocketMap> extends PluginArgs<T> {
	status: SocketStatus,
	code: number,
	reason?: string
}

export interface MessagePluginArgs<T extends SocketMap = EmptySocketMap> extends PluginArgs<T> {
	timestamp: Date,
	packet: AnyPacket<T> | AnyResponse<T>
}

export interface MessageRawPluginArgs<T extends SocketMap = EmptySocketMap> extends PluginArgs<T> {
	timestamp: Date,
	message: ws.RawData | string,
	promise: Promise<void>
}

export interface SendRequestPluginArgs<T extends SocketMap = EmptySocketMap> extends PluginArgs<T> {
	requests: AnyRequest<T>[],
	cont: (requests: AnyRequest<T>[]) => void
}

export interface SendResponsePluginArgs<T extends SocketMap = EmptySocketMap> extends PluginArgs<T> {
	responses: AnyResponse<T>[],
	cont: (requests: AnyResponse<T>[]) => void
}

export interface Plugin<T extends SocketMap = EmptySocketMap> {
	type: string,
	handlers?: HandlerMap<T>,
	onAuthenticated?(options: PluginArgs<T>): void,
	onClose?(options: PluginArgs<T>): void,
	onDeauthenticate?(options: PluginArgs<T>): void,
	onDisconnected?(options: DisconnectedPluginArgs<T>): void,
	onEnd?(options: PluginArgs<T>): void,
	onMessage?(options: MessagePluginArgs<T>): Promise<AnyPacket<T> | AnyResponse<T>>,
	onMessageRaw?(options: MessageRawPluginArgs<T>): Promise<ws.RawData | string>,
	onOpen?(options: PluginArgs<T>): void,
	onReady?(options: PluginArgs<T>): void,
	sendRequest?(options: SendRequestPluginArgs<T>): void,
	sendResponse?(options: SendResponsePluginArgs<T>): void
}