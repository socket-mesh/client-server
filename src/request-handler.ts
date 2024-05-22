import { TimeoutError } from "@socket-mesh/errors";
import { MethodMap, PublicMethodMap, ServiceMap } from "./client/maps/method-map.js";
import { Socket } from "./socket.js";
import { SocketTransport } from "./socket-transport.js";

export interface RequestHandlerArgsOptions<
	TOptions,
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object
> {
	method: string,
	socket: Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>,
	transport: SocketTransport<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>,
	timeoutMs?: number | boolean,
	options?: TOptions
}

export class RequestHandlerArgs<
	TOptions,
	TSocketState extends object = {},
	TIncomingMap extends MethodMap<TIncomingMap> = {},
	TServiceMap extends ServiceMap<TServiceMap> = {},
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap> = {},
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> = {}
> {
	public requestedAt: Date;
	public timeoutMs?: number | boolean;
	public socket: Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	public transport: SocketTransport<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	public method: string;
	public options: TOptions;

	constructor(options: RequestHandlerArgsOptions<TOptions, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>) {
		this.requestedAt = new Date();
		this.method = options.method;
		this.socket = options.socket;
		this.transport = options.transport;
		this.options = options.options;
		this.timeoutMs = options.timeoutMs;
	}

	getRemainingTimeMs(): number {
		if (typeof this.timeoutMs === 'number') {
			return (this.requestedAt.valueOf() + this.timeoutMs) - new Date().valueOf();
		}

		return Infinity;
	}

	checkTimeout(timeLeftMs = 0): void {
		if (typeof this.timeoutMs === 'number' && this.getRemainingTimeMs() <= timeLeftMs) {
			throw new TimeoutError(`Method \'${this.method}\' timed out.`);
		}
	}
}

export type RequestHandler<
	TOptions,
	U,
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object
> = (args: RequestHandlerArgs<TOptions, TSocketState, TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>) => Promise<U>;