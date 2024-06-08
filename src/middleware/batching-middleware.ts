import { EmptySocketMap, SocketMap } from "../client/maps/socket-map.js";
import { MethodRequest, ServiceRequest } from "../request.js";
import { Middleware, SendRequestMiddlewareArgs } from "./middleware.js";

export interface BatchingMiddlewareOptions {
	// Whether or not to start batching messages immediately after the connection handshake completes. This is useful for handling
	// connection recovery when the client tries to resubscribe to a large number of channels in a very short amount of time. Defaults to false.
	// This lets you specify how long to enable batching (in milliseconds) following a successful socket handshake.
	batchOnHandshakeDuration?: number | boolean,

	// This lets you specify the size of each batch in milliseconds.
	batchInterval?: number
}

export class BatchingMiddleware<T extends SocketMap = EmptySocketMap> implements Middleware<T> {
	public batchOnHandshakeDuration: number | boolean;
	public batchInterval: number;
	
	private _isBatching: boolean;
	private _requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[];
	private _continue: (requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[]) => void | null;
	private _handshakeTimeoutId: NodeJS.Timeout | null;
	private _batchingIntervalId: NodeJS.Timeout | null;

	constructor(options?: BatchingMiddlewareOptions) {
		this._isBatching = false;
		this._requests = [];
		this._continue = null;
		this._batchingIntervalId = null;
		this._handshakeTimeoutId = null;
		this.batchInterval = options?.batchInterval || 50;
		this.batchOnHandshakeDuration = options?.batchOnHandshakeDuration ?? false;
	}

	type: 'batching'

	public get isBatching(): boolean {
		return this._isBatching || this._batchingIntervalId !== null;
	}

	public onReady(): void {
		if (this._isBatching) {
			this.start();
		} else if (typeof this.batchOnHandshakeDuration === 'number' && this.batchOnHandshakeDuration > 0) {
			this.start();
			this._handshakeTimeoutId = setTimeout(() => {
				this.stop();
			}, this.batchOnHandshakeDuration);
		}
	}

	public onDisconnected(): void {
		this.cancelBatching();
	}
	
	public startBatching(): void {
		this._isBatching = true;
		this.start();
	}

	private start(): void {
		if (this._batchingIntervalId !== null) {
			return;
		}

		this._batchingIntervalId = setInterval(() => {
			this.flush();
		}, this.batchInterval);
	}

	public stopBatching(): void {
		this._isBatching = false;
		this.stop();
	}

	private stop(): void {
		if (this._batchingIntervalId !== null) {
			clearInterval(this._batchingIntervalId);
		}

		this._batchingIntervalId = null;

		if (this._handshakeTimeoutId !== null) {
			clearTimeout(this._handshakeTimeoutId);
		}

		this._handshakeTimeoutId = null;

		this.flush();
	}

	public cancelBatching(): void {
		if (this._batchingIntervalId !== null) {
			clearInterval(this._batchingIntervalId);
		}

		this._isBatching = false;
		this._batchingIntervalId = null;
		this._requests = [];
		this._continue = null;
	}

	private flush() {
		if (this._requests.length) {
			this._continue(this._requests);
			this._requests = [];
			this._continue = null;
		}
	}

	public sendRequest({ requests, cont }: SendRequestMiddlewareArgs<T>): void {
		if (!this.isBatching) {
			cont(requests);
			return;
		}

		this._continue = cont;
		this._requests.push(...requests);
	}
}