import { Server } from "./server.js";
import { ServerMap } from "../client/maps/server-map.js";

export interface ServerSocketState<T extends ServerMap> {
	server: Server<T>
}
