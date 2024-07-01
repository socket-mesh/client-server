import { IncomingMessage } from "http";
import { ServerMap } from "../../client/maps/server-map.js";
import { SocketMapFromServer } from "../../client/maps/socket-map.js";
import { Middleware } from "../../middleware/middleware.js";
import { AuthInfo } from "../handlers/authenticate.js";
import { ServerSocket } from "../server-socket.js";
import { ServerTransport } from "../server-transport.js";

export interface HandshakeMiddlewareArgs<T extends ServerMap> {
	socket: ServerSocket<T>,
	transport: ServerTransport<T>	
	authInfo: AuthInfo
}

export interface ServerMiddleware<T extends ServerMap> extends Middleware<SocketMapFromServer<T>> {
	onAuthenticate?: (authInfo: AuthInfo) => void,
	onConnection?: (request: IncomingMessage) => Promise<void>,
	onHandshake?: (options: HandshakeMiddlewareArgs<T>) => Promise<void>
};