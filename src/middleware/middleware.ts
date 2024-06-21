import { EmptySocketMap, SocketMap } from "../client/maps/socket-map.js";
import { AnyPacket } from "../packet.js";
import { AnyRequest, RequestCollection } from "../request.js";
import { AnyResponse } from "../response.js";
import { SocketTransport } from "../socket-transport.js";
import { Socket, SocketStatus } from "../socket.js";
import ws from "isomorphic-ws";

export type MiddlewareType = 'request' | 'response' | 'handshake';

export interface MiddlewareArgs<T extends SocketMap = EmptySocketMap> {
	socket: Socket<T>,
	transport: SocketTransport<T>
}

export interface DisconnectedMiddlewareArgs<T extends SocketMap = EmptySocketMap> extends MiddlewareArgs<T> {
	status: SocketStatus,
	code: number,
	reason?: string
}

export interface MessageMiddlewareArgs<T extends SocketMap = EmptySocketMap> extends MiddlewareArgs<T> {
	timestamp: Date,
	packet: AnyPacket<T> | AnyResponse<T>
}

export interface MessageRawMiddlewareArgs<T extends SocketMap = EmptySocketMap> extends MiddlewareArgs<T> {
	timestamp: Date,
	message: ws.RawData | string,
	promise: Promise<void>
}

export interface SendRequestMiddlewareArgs<T extends SocketMap = EmptySocketMap> extends MiddlewareArgs<T> {
	requests: AnyRequest<T>[],
	cont: (requests: AnyRequest<T>[]) => void
}

export interface SendResponseMiddlewareArgs<T extends SocketMap = EmptySocketMap> extends MiddlewareArgs<T> {
	responses: AnyResponse<T>[],
	cont: (requests: AnyResponse<T>[]) => void
}

export interface Middleware<T extends SocketMap = EmptySocketMap> {
	type: string,
	onAuthenticated?(options: MiddlewareArgs<T>): void,
	onClose?(options: MiddlewareArgs<T>): void,
	onDeauthenticate?(options: MiddlewareArgs<T>): void,
	onDisconnected?(options: DisconnectedMiddlewareArgs<T>): void,
	onEnd?(options: MiddlewareArgs<T>): void,
	onMessage?(options: MessageMiddlewareArgs<T>): Promise<AnyPacket<T> | AnyResponse<T>>,
	onMessageRaw?(options: MessageRawMiddlewareArgs<T>): Promise<ws.RawData | string>,
	onOpen?(options: MiddlewareArgs<T>): void,
	onReady?(options: MiddlewareArgs<T>): void,
	sendRequest?(options: SendRequestMiddlewareArgs<T>): void,
	sendResponse?(options: SendResponseMiddlewareArgs<T>): void
}