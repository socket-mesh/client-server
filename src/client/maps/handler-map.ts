import { MethodMap, PublicMethodMap, ServiceMap } from "./method-map.js";
import { RequestHandler } from "../../request-handler.js";

export type HandlerMap<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object
> = Partial<
	{
		[K in keyof TIncomingMap]:
			RequestHandler<
				Parameters<TIncomingMap[K]>[0],
				ReturnType<TIncomingMap[K]>,
				TIncomingMap,
				TServiceMap,
				TOutgoingMap,
				TPrivateOutgoingMap,
				TSocketState
			>
	}
>