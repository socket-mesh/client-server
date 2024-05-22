import { MethodMap, PublicMethodMap, ServiceMap } from "../../client/maps/method-map.js";
import { Middleware } from "../../middleware/middleware.js";
import { AuthInfo } from "../handlers/authenticate.js";

export interface HandshakeMiddleware<
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>
> extends Middleware {
	type: 'handshake',

	onHandshake(authInfo: AuthInfo): void
}