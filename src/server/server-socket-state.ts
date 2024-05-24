import { Server } from "./server.js";
import { ServerMap } from "../client/maps/socket-map.js";

export interface ServerSocketState<T extends ServerMap> {
	server: Server<T>
}
