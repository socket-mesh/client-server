import { ServerMap } from "../../client/maps/server-map.js";
import { SocketMapFromServer } from "../../client/maps/socket-map.js";
import { Middleware } from "../../middleware/middleware.js";
import { AuthenticateMiddleware } from "./authenticate-middleware.js";
import { HandshakeMiddleware } from "./handshake-middleware.js";

export type ServerMiddleware<T extends ServerMap> = Middleware<SocketMapFromServer<T>> | AuthenticateMiddleware | HandshakeMiddleware;