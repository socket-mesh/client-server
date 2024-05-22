import { MethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map";
import { AnyRequest } from "../request";
import { Middleware } from "./middleware";

export interface RequestMiddleware<
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>
> extends Middleware {
	type: 'request',

	sendRequest(
		requests: AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>[],
		cont: (requests: AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>[]) => void
	): void
}