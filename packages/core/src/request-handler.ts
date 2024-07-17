import { TimeoutError } from "@socket-mesh/errors";
import { Socket } from "./socket.js";
import { SocketTransport } from "./socket-transport.js";
import { EmptySocketMap, SocketMap } from "./maps/socket-map.js";

export interface RequestHandlerArgsOptions<
	TOptions,
	T extends SocketMap,
	TSocket extends Socket<T> = Socket<T>,
	TTransport extends SocketTransport<T> = SocketTransport<T>
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
	T extends SocketMap = EmptySocketMap,
	TSocket extends Socket<T> = Socket<T>,
	TTransport extends SocketTransport<T> = SocketTransport<T>
> {
	public isRpc: boolean;
	public method: string;
	public options: TOptions;
	public requestedAt: Date;
	public socket: TSocket;
	public timeoutMs?: number | boolean;
	public transport: TTransport;

	constructor(options: RequestHandlerArgsOptions<TOptions, T, TSocket, TTransport>) {
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
	T extends SocketMap,
	TSocket extends Socket<T> = Socket<T>,
	TTransport extends SocketTransport<T> = SocketTransport<T>
> = (args: RequestHandlerArgs<TOptions, T, TSocket, TTransport>) => Promise<U>;