import ws from "ws";
import { ClientPrivateMap } from "../client/maps/client-private-map.js";
import { MethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map.js";
import { ServerPrivateMap } from "../client/maps/server-private-map.js";
import { ServerSocketState } from "./server-socket-state.js";
import { AuthEngine, AuthEngineOptions } from "./auth-engine.js";
import { CallIdGenerator } from "../socket-transport.js";
import { CodecEngine } from "@socket-mesh/formatter";
import { HandlerMap } from "../client/maps/handler-map.js";
import { ServerMiddleware } from "./middleware/server-middleware.js";
import { ChannelMap } from "../client/channels/channel-map.js";

export interface ServerOptions<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TChannelMap extends ChannelMap<TChannelMap>, 	
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TSocketState extends object = {}
> extends ws.ServerOptions {
	// In milliseconds, the timeout for receiving a response
	// when using invoke() or invokePublish().
	ackTimeoutMs?: number,

	authEngine?: AuthEngine | AuthEngineOptions,

	callIdGenerator?: CallIdGenerator,

	codecEngine?: CodecEngine,

	// In milliseconds, the timeout for receiving a response
	// when using invoke() or invokePublish().	ackTimeout: number
	handshakeTimeoutMs?: number,

	handlers?:
		HandlerMap<
			TIncomingMap,
			TServiceMap,
			TOutgoingMap,
			TPrivateIncomingMap & ServerPrivateMap,
			TSocketState
		> |
		HandlerMap<
			TIncomingMap & TPrivateIncomingMap & ServerPrivateMap,
			TServiceMap,
			TOutgoingMap,
			TPrivateOutgoingMap,
			TSocketState
		>;

	middleware?: ServerMiddleware<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>[],

	// The interval in milliseconds on which to  send a ping to the client to check that
	// it is still alive.
	pingIntervalMs?: number,

	pingTimeoutMs?: number | false,
}
