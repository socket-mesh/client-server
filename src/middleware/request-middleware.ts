import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map";
import { AnyRequest } from "../request";
import { Middleware } from "./middleware";

export interface RequestMiddleware<
	TServiceMap extends ServiceMap = {},
	TOutgoingMap extends PublicMethodMap = {},
	TPrivateOutgoingMap extends PrivateMethodMap = {}
> extends Middleware {
	type: 'request',

	sendRequest(
		requests: AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>[],
		cont: (requests: AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>[]) => void
	): void
}