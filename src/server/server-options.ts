import ws from "ws";
import { AuthEngine, AuthEngineOptions } from "./auth-engine.js";
import { CallIdGenerator } from "../socket-transport.js";
import { CodecEngine } from "@socket-mesh/formatter";
import { HandlerMap } from "../client/maps/handler-map.js";
import { ServerMiddleware } from "./middleware/server-middleware.js";
import { EmptySocketMap } from "../client/maps/socket-map.js";
import { ServerMap } from "../client/maps/server-map.js";

export interface ServerOptions<T extends ServerMap> extends ws.ServerOptions {
	// In milliseconds, the timeout for receiving a response
	// when using invoke() or invokePublish().
	ackTimeoutMs?: number,

	authEngine?: AuthEngine | AuthEngineOptions,

	callIdGenerator?: CallIdGenerator,

	codecEngine?: CodecEngine,

	// In milliseconds, the timeout for receiving a response
	// when using invoke() or invokePublish().	ackTimeout: number
	handshakeTimeoutMs?: number,

	handlers?: HandlerMap<EmptySocketMap>;

	middleware?: ServerMiddleware<T>[],

	// The interval in milliseconds on which to send a ping to the client to check that
	// it is still alive.
	pingIntervalMs?: number,

	pingTimeoutMs?: number | false,
}
