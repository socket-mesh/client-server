import { SocketMap } from "../client/maps/socket-map.js";
import { SocketStatus } from "../socket.js";
import { RequestMiddleware } from "./request-middleware.js";
import { ResponseMiddleware } from "./response-middleware.js";

export type MiddlewareType = 'request' | 'response' | 'handshake';

export type AnyMiddleware<T extends SocketMap> = 
	RequestMiddleware<T['Service'], T['Outgoing'], T['PrivateOutgoing']> |
	ResponseMiddleware<T['Service'], T['Incoming']> |
	Middleware;

export interface Middleware {
	type: string,
	onAuthenticate?: () => void,
	onClose?: () => void,
	onDeauthenticate?: () => void,
	onDisconnect?: (status: SocketStatus, code: number, reason?: string) => void,
	onOpen?: () => void
}