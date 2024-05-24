import { TimeoutError } from "@socket-mesh/errors";
import { Socket } from "./socket.js";
import { SocketTransport } from "./socket-transport.js";
import { EmptySocketMap, SocketMap } from "./client/maps/socket-map.js";

export interface RequestHandlerArgsOptions<TOptions, T extends SocketMap> {
	method: string,
	socket: Socket<T>,
	transport: SocketTransport<T>,
	timeoutMs?: number | boolean,
	options?: TOptions
}

export class RequestHandlerArgs<TOptions, T extends SocketMap = EmptySocketMap> {
	public requestedAt: Date;
	public timeoutMs?: number | boolean;
	public socket: Socket<T>;
	public transport: SocketTransport<T>;
	public method: string;
	public options: TOptions;

	constructor(options: RequestHandlerArgsOptions<TOptions, T>) {
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

export type RequestHandler<TOptions, U, T extends SocketMap> = (args: RequestHandlerArgs<TOptions, T>) => Promise<U>;