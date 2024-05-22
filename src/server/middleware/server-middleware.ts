import { MethodMap, PublicMethodMap, ServiceMap } from "../../client/maps/method-map.js";
import { AnyMiddleware } from "../../middleware/middleware.js";
import { AuthenticateMiddleware } from "./authenticate-middleware.js";
import { HandshakeMiddleware } from "./handshake-middleware.js";

export type ServerMiddleware<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>
> =
	AnyMiddleware<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap> |
	AuthenticateMiddleware<TServiceMap, TOutgoingMap, TPrivateOutgoingMap> |
	HandshakeMiddleware<TServiceMap, TOutgoingMap, TPrivateOutgoingMap>