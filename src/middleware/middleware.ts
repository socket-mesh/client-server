import { EmptySocketMap, SocketMap } from "../client/maps/socket-map.js";
import { AnyRequest } from "../request.js";
import { AnyResponse } from "../response.js";
import { SocketStatus } from "../socket.js";

export type MiddlewareType = 'request' | 'response' | 'handshake';

export interface Middleware<T extends SocketMap = EmptySocketMap> {
	type: string,
	publishIn?(): void,
	publishOut?(): void,
	onAuthenticate?() : void,
	onClose?() : void,
	onDeauthenticate?() : void,
	onDisconnect?(status: SocketStatus, code: number, reason?: string): void,
	onOpen?() : void,
	sendRequest?(
		requests: AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>[],
		cont: (requests: AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>[]) => void
	): void,
	sendResponse?(
		responses: AnyResponse<T['Service'], T['Incoming']>[],
		cont: (requests: AnyResponse<T['Service'], T['Incoming']>[]) => void
	): void
}