import { EmptySocketMap, SocketMap } from "../client/maps/socket-map.js";
import { AnyRequest, MethodRequest, ServiceRequest } from "../request.js";
import { AnyResponse } from "../response.js";
import { Middleware, SendRequestMiddlewareArgs, SendResponseMiddlewareArgs } from "./middleware.js";

export interface BatchingMiddlewareOptions {
	// Whether or not to start batching messages immediately after the connection handshake completes. This is useful for handling
	// connection recovery when the client tries to resubscribe to a large number of channels in a very short amount of time. Defaults to false.
	// This lets you specify how long to enable batching (in milliseconds) following a successful socket handshake.
	batchOnHandshakeDuration?: number | false,

	// This lets you specify the size of each batch in milliseconds.
	batchInterval?: number
}

export abstract class BatchingMiddleware<T extends SocketMap = EmptySocketMap> implements Middleware<T> {
	public batchOnHandshakeDuration: number | boolean;
	public batchInterval: number;
	
	private _batchingIntervalId: NodeJS.Timeout | null;
	private _handshakeTimeoutId: NodeJS.Timeout | null;
	private _isBatching: boolean;

	constructor(options?: BatchingMiddlewareOptions) {
		this._isBatching = false;
		this.batchInterval = options?.batchInterval || 50;
		this.batchOnHandshakeDuration = options?.batchOnHandshakeDuration ?? false;
		this._batchingIntervalId = null;
		this._handshakeTimeoutId = null;
	}

	type: string

	public cancelBatching(): void {
		if (this._batchingIntervalId !== null) {
			clearInterval(this._batchingIntervalId);
		}

		this._isBatching = false;
		this._batchingIntervalId = null;
	}

	protected abstract flush(): void;

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
			this._handshakeTimeoutId = null;
		}

		this.flush();
	}
}

export class RequestBatchingMiddleware<T extends SocketMap = EmptySocketMap> extends BatchingMiddleware<T> {
	private _requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[];
	private _continue: (requests: AnyRequest<T>[], cb?: (error?: Error) => void) => void | null;

	constructor(options?: BatchingMiddlewareOptions) {
		super(options);

		this.type = 'requestBatching';
		this._requests = [];
		this._continue = null;
	}

	public override cancelBatching(): void {
		super.cancelBatching();

		this._requests = [];
		this._continue = null;
	}

	protected override flush() {
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

	type: 'requestBatching'
}

export class ResponseBatchingMiddleware<T extends SocketMap = EmptySocketMap> extends BatchingMiddleware<T> {
	private _responses: AnyResponse<T>[];
	private _continue: (requests: AnyResponse<T>[], cb?: (error?: Error) => void) => void | null;

	constructor(options?: BatchingMiddlewareOptions) {
		super(options);

		this.type = 'responseBatching';
		this._responses = [];
		this._continue = null;
	}

	protected override flush() {
		if (this._responses.length) {
			this._continue(this._responses);
			this._responses = [];
			this._continue = null;
		}
	}

	public sendResponse({ responses, cont }: SendResponseMiddlewareArgs<T>): void {
		if (!this.isBatching) {
			cont(responses);
			return;
		}

		this._continue = cont;
		this._responses.push(...responses);
	}

	type: 'responseBatching'
}