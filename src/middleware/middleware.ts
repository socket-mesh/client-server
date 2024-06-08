import { EmptySocketMap, SocketMap } from "../client/maps/socket-map.js";
import { AnyRequest } from "../request.js";
import { AnyResponse } from "../response.js";
import { SocketTransport } from "../socket-transport.js";
import { Socket, SocketStatus } from "../socket.js";

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

export interface SendRequestMiddlewareArgs<T extends SocketMap = EmptySocketMap> extends MiddlewareArgs<T> {
	requests: AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>[],
	cont: (requests: AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>[]) => void
}

export interface SendResponseMiddlewareArgs<T extends SocketMap = EmptySocketMap> extends MiddlewareArgs<T> {
	responses: AnyResponse<T['Service'], T['Incoming']>[],
	cont: (requests: AnyResponse<T['Service'], T['Incoming']>[]) => void
}

export interface Middleware<T extends SocketMap = EmptySocketMap> {
	type: string,
	onAuthenticated?(options: MiddlewareArgs<T>): void,
	onClose?(options: MiddlewareArgs<T>): void,
	onDeauthenticate?(options: MiddlewareArgs<T>): void,
	onDisconnected?(options: DisconnectedMiddlewareArgs<T>): void,
	onOpen?(options: MiddlewareArgs<T>): void,
	onReady?(options: MiddlewareArgs<T>): void,
	sendRequest?(options: SendRequestMiddlewareArgs<T>): void,
	sendResponse?(options: SendResponseMiddlewareArgs<T>): void
}