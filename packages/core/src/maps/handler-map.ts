import { RequestHandler } from "../request-handler.js";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./method-map.js";

export type HandlerMap<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object,
> = Partial<
	{
		[K in keyof TIncoming]:
			RequestHandler<
				Parameters<TIncoming[K]>[0],
				ReturnType<TIncoming[K]>,
				TIncoming,
				TOutgoing,
				TPrivateOutgoing,
				TService,
				TState
			>
	}
>