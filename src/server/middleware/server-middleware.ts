import { ServerMap } from "../../client/maps/server-map.js";
import { SocketMapFromServer } from "../../client/maps/socket-map.js";
import { Middleware } from "../../middleware/middleware.js";
import { AuthInfo } from "../handlers/authenticate.js";

export interface ServerMiddleware<T extends ServerMap> extends Middleware<SocketMapFromServer<T>> {
	onAuthenticate?: (authInfo: AuthInfo) => void,
	onHandshake?: (authInfo: AuthInfo) => void
};