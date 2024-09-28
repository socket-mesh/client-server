import http from "http";
import { Server } from "./server.js";
import { ServerOptions } from "./server-options.js";
import { ChannelMap } from "@socket-mesh/channels";
import { PrivateMethodMap, PublicMethodMap, ServiceMap } from "@socket-mesh/core";
export { Server } from "./server.js";
export { ServerSocket } from "./server-socket.js";
export { PluginType } from "@socket-mesh/core";
export { BasicServerMap } from "./maps/server-map.js";
export { BasicSocketMapServer } from "./maps/socket-map.js";

/**
 * Creates an http.Server exclusively used for WS upgrades.
 *
 * @param {Number} port
 * @param {Function} callback
 * @param {Object} options
 * @return {AGServer} websocket cluster server
 * @api public
 */
export function listen<
	TChannel extends ChannelMap = {},
	TService extends ServiceMap = {},
	TIncoming extends PublicMethodMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateIncoming extends PrivateMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TServerState extends object = {},
	TState extends object = {}
>(): Server<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;
//export function listen<T extends ServerMap>(port: number, fn: () => void): Server<T>;
export function listen<
	TChannel extends ChannelMap = {},
	TService extends ServiceMap = {},
	TIncoming extends PublicMethodMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateIncoming extends PrivateMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TServerState extends object = {},
	TState extends object = {}
>(
	port: number,
	options: ServerOptions<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>
): Server<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;
export function listen<
	TChannel extends ChannelMap = {},
	TService extends ServiceMap = {},
	TIncoming extends PublicMethodMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateIncoming extends PrivateMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TServerState extends object = {},
	TState extends object = {}
>(
	port: number,
	options: ServerOptions<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>, fn: () => void
): Server<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;
export function listen<
	TChannel extends ChannelMap,
	TService extends ServiceMap,
	TIncoming extends PublicMethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateIncoming extends PrivateMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TServerState extends object,
	TState extends object
>(
	port?: number,
	options?: ServerOptions<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> | (() => void), fn?: () => void
): Server<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> {
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
export function attach<
	TChannel extends ChannelMap = {},
	TService extends ServiceMap = {},
	TIncoming extends PublicMethodMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateIncoming extends PrivateMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TServerState extends object = {},
	TState extends object = {}
>(
	server: http.Server,
	options?: ServerOptions<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>
): Server<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> {
  if (options == null) {
    options = {};
  }
  options.server = server;

  return new Server(options);
};