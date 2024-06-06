import { RequestHandler } from "../../request-handler.js";
import { SocketMap } from "./socket-map.js";

export type HandlerMap<T extends SocketMap> = Partial<
	{
		[K in keyof T['Incoming']]:
			RequestHandler<
				Parameters<T['Incoming'][K]>[0],
				ReturnType<T['Incoming'][K]>,
				T
			>
	}
>