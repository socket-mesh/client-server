import { TimeoutError } from "@socket-mesh/errors";
import { Socket } from "./socket.js";
import { SocketTransport } from "./socket-transport.js";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./maps/method-map.js";

export interface RequestHandlerArgsOptions<
	TOptions,
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object,
	TSocket extends Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> = Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>,
	TTransport extends SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> = SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>
> {
	isRpc: boolean,
	method: string,
	socket: TSocket,
	transport: TTransport,
	timeoutMs?: number | boolean,
	options?: TOptions
}

export class RequestHandlerArgs<
	TOptions,
	TIncoming extends MethodMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TService extends ServiceMap = {},
	TState extends object = {},
	TSocket extends Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> = Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>,
	TTransport extends SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> = SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>
> {
	public isRpc: boolean;
	public method: string;
	public options: TOptions;
	public requestedAt: Date;
	public socket: TSocket;
	public timeoutMs?: number | boolean;
	public transport: TTransport;

	constructor(options: RequestHandlerArgsOptions<TOptions, TIncoming, TOutgoing, TPrivateOutgoing, TService, TState, TSocket, TTransport>) {
		this.isRpc = options.isRpc;
		this.method = options.method;
		this.options = options.options;
		this.requestedAt = new Date();
		this.socket = options.socket;
		this.transport = options.transport;
		this.timeoutMs = options.timeoutMs;
	}

	checkTimeout(timeLeftMs = 0): void {
		if (typeof this.timeoutMs === 'number' && this.getRemainingTimeMs() <= timeLeftMs) {
			throw new TimeoutError(`Method \'${this.method}\' timed out.`);
		}
	}

	getRemainingTimeMs(): number {
		if (typeof this.timeoutMs === 'number') {
			return (this.requestedAt.valueOf() + this.timeoutMs) - new Date().valueOf();
		}

		return Infinity;
	}
}

export type RequestHandler<
	TOptions, U,
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object,
	TSocket extends Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> = Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>,
	TTransport extends SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> = SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>
> = (args: RequestHandlerArgs<TOptions, TIncoming, TOutgoing, TPrivateOutgoing, TService, TState, TSocket, TTransport>) => Promise<U>;