import { MethodMap, ServiceMap } from "../client/maps/method-map";
import { AnyResponse } from "../response";
import { Middleware } from "./middleware";

export interface ResponseMiddleware<
	TServiceMap extends ServiceMap<TServiceMap>,
	TIncomingMap extends MethodMap<TIncomingMap>
> extends Middleware {
	type: 'response',

	sendResponse(
		responses: AnyResponse<TServiceMap, TIncomingMap>[],
		cont: (requests: AnyResponse<TServiceMap, TIncomingMap>[]) => void
	): void
}