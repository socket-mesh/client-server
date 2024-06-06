import http from "http";
import { Server } from "./server/server.js";
import { ServerOptions } from "./server/server-options.js";
import { ServerMap } from "./client/maps/server-map.js";
export { Server } from "./server/server.js";
export { ServerSocket } from "./server/server-socket.js";
export { MiddlewareType } from "./middleware/middleware.js";

/**
 * Creates an http.Server exclusively used for WS upgrades.
 *
 * @param {Number} port
 * @param {Function} callback
 * @param {Object} options
 * @return {AGServer} websocket cluster server
 * @api public
 */
export function listen<T extends ServerMap>(): Server<T>;
//export function listen<T extends ServerMap>(port: number, fn: () => void): Server<T>;
export function listen<T extends ServerMap>(port: number, options: ServerOptions<T>): Server<T>;
export function listen<T extends ServerMap>(port: number, options: ServerOptions<T>, fn: () => void): Server<T>;
export function listen<T extends ServerMap>(port?: number, options?: ServerOptions<T> | (() => void), fn?: () => void): Server<T> {
  if (typeof options === 'function') {
    fn = options;
    options = {};
  } else if (!options) {
		options = {};
	}

  const server = http.createServer((req, res) => {
    res.writeHead(501);
    res.end('Not Implemented');
  });

	options.server = server;

  const socketClusterServer = attach(server, options);
  
  server.listen(port, fn);

  return socketClusterServer;
};

/**
 * Captures upgrade requests for a http.Server.
 *
 * @param {http.Server} server
 * @param {Object} options
 * @return {AGServer} websocket cluster server
 * @api public
 */
export function attach<T extends ServerMap>(server: http.Server, options?: ServerOptions<T>): Server<T> {
  if (options == null) {
    options = {};
  }
  options.server = server;

  return new Server(options);
};