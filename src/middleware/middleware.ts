import { PublicMethodMap, MethodMap, ServiceMap } from "../client/maps/method-map.js";
import { SocketStatus } from "../socket.js";
import { RequestMiddleware } from "./request-middleware.js";
import { ResponseMiddleware } from "./response-middleware.js";

export type MiddlewareType = 'request' | 'response' | 'handshake';

export type AnyMiddleware<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>
> = 
	RequestMiddleware<TServiceMap, TOutgoingMap, TPrivateOutgoingMap> |
	ResponseMiddleware<TServiceMap, TIncomingMap> |
	Middleware;

export interface Middleware {
	type: string,
	onAuthenticate?: () => void,
	onClose?: () => void,
	onDeauthenticate?: () => void,
	onDisconnect?: (status: SocketStatus, code: number, reason?: string) => void,
	onOpen?: () => void
}