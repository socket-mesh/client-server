import defaultCodec, { CodecEngine } from "@socket-mesh/formatter";
import ws from "isomorphic-ws";
import { Middleware } from "./middleware/middleware.js";
import { AnyPacket, AnyRequest, InvokeMethodRequest, InvokeServiceRequest, MethodPacket, TransmitMethodRequest, TransmitServiceRequest } from "./request.js";
import { AbortError, BadConnectionError, InvalidActionError, InvalidArgumentsError, MiddlewareBlockedError, MiddlewareCaughtError, MiddlewareError, SocketProtocolError, TimeoutError, dehydrateError, socketProtocolErrorStatuses, socketProtocolIgnoreStatuses } from "@socket-mesh/errors";
import { ClientRequest, IncomingMessage } from "http";
import { FunctionReturnType, MethodMap, ServiceMap } from "./client/maps/method-map.js";
import { AnyResponse, MethodDataResponse } from "./response.js";
import { HandlerMap } from "./client/maps/handler-map.js";
import { AuthToken, extractAuthTokenData, SignedAuthToken } from "@socket-mesh/auth";
import { Socket, SocketOptions, SocketStatus, StreamCleanupMode } from "./socket.js";
import base64id from "base64id";
import { RequestHandlerArgs } from "./request-handler.js";
import { SocketMap } from "./client/maps/socket-map.js";
import { wait } from "./utils.js";

export type CallIdGenerator = () => number;

export interface InvokeMethodOptions<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> {
	method: TMethod,
	ackTimeoutMs?: number | false
}

export interface InvokeServiceOptions<TServiceMap extends ServiceMap, TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]> {
	service: TService,
	method: TMethod,
	ackTimeoutMs?: number | false
}

interface InvokeCallback<T> {
	method: string,
	timeoutId?: NodeJS.Timeout,
	callback: (err: Error, result?: T) => void
}

interface WebSocketError extends Error {
	code?: string
}

export class SocketTransport<T extends SocketMap> {
	private _socket: Socket<T>;
	private _webSocket: ws.WebSocket;
	private _isReady: boolean;
	private _authToken?: AuthToken;
	private _signedAuthToken?: SignedAuthToken;
	private readonly _callIdGenerator: CallIdGenerator;
	private readonly _callbackMap: {[cid: number]: InvokeCallback<unknown>};
	private _handlers: HandlerMap<T>;
	private _onUnhandledRequest: (socket: SocketTransport<T>, packet: AnyPacket<T['Service'], T['Incoming']>) => boolean;
	public readonly codecEngine: CodecEngine;
	public readonly middleware: Middleware<T>[];
	public readonly state: Partial<T['State']>;
	public streamCleanupMode: StreamCleanupMode;
	public id: string;
	public ackTimeoutMs: number;

	private _pingTimeoutRef: NodeJS.Timeout;

	protected constructor(options?: SocketOptions<T>) {
		let cid = 1;

		this.ackTimeoutMs = options?.ackTimeoutMs ?? 10000;

		this._callIdGenerator = options?.callIdGenerator || (() => {
			return cid++;
		});

		this._callbackMap = {};
		this.codecEngine = options?.codecEngine || defaultCodec;
		this._handlers = options?.handlers || {};
		this.id = (options?.id || base64id.generateId());
		this.middleware = options?.middleware || [];
		this.state = options?.state || {};
		this.streamCleanupMode = options?.streamCleanupMode || 'kill';
	}

	protected abortAllPendingCallbacksDueToBadConnection(status: SocketStatus): void {
		for (const cid in this._callbackMap) {
			const map = this._callbackMap[cid];
			const msg = `Event ${map.method} was aborted due to a bad connection`;

			map.callback(
				new BadConnectionError(msg, status === 'ready' ? 'disconnect' : 'connectAbort')
			);
		}
	}

	public get authToken(): AuthToken {
		return this._authToken;
	}
	
	public callMiddleware(middleware: Middleware<T>, fn: () => void): void {
		try {
			fn();
		} catch (err) {
			if (err instanceof MiddlewareBlockedError) {
				throw err;
			}

			if (err instanceof MiddlewareCaughtError) {
				throw err.innerError;
			}

			this.onError(err);

			throw new MiddlewareError(`An unexpected error occurred in the ${middleware.type} middleware.`, middleware.type);
		}
	}

	public async changeToUnauthenticatedState(): Promise<boolean> {
		if (this._signedAuthToken) {
			const authToken = this._authToken;
			const signedAuthToken = this._signedAuthToken;

			this._authToken = null;
			this._signedAuthToken = null;	

			this._socket.emit('authStateChange', { wasAuthenticated: true, isAuthenticated: false });

			// In order for the events to trigger we need to wait for the next tick.
			await wait(0);

			this._socket.emit('deauthenticate', { signedAuthToken, authToken });

			for (const middleware of this.middleware) {
				if (middleware.onDeauthenticate) {
					middleware.onDeauthenticate({ socket: this.socket, transport: this });
				}	
			}

			return true;
		}

		return false;
	}

	protected decode(data: string | ws.RawData): any {
		try {
			return this.codecEngine.decode(data as string);
		} catch (err) {
			if (err.name === 'Error') {
				err.name = 'InvalidMessageError';
			}

			this.onError(err);
			return null;
		}
	}

	public disconnect(code=1000, reason?: string): void {
		if (this.webSocket) {
			this.webSocket.close(code);
			this.onClose(code, reason);
		}
	}

	public ping(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.webSocket.ping(undefined, undefined, (err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
	}

	public get socket(): Socket<T> {
		return this._socket;
	}

	public set socket(value: Socket<T>) {
		this._socket = value;
	}

	public get signedAuthToken(): SignedAuthToken {
		return this._signedAuthToken;
	}

	public async setAuthorization(authToken: AuthToken): Promise<boolean>;
	public async setAuthorization(signedAuthToken: SignedAuthToken, authToken?: AuthToken): Promise<boolean>;
	public async setAuthorization(signedAuthToken: AuthToken | SignedAuthToken, authToken?: AuthToken): Promise<boolean> {
		if (typeof signedAuthToken !== 'string') {
			throw new InvalidArgumentsError('SignedAuthToken must be type string.');
		}

		if (signedAuthToken !== this._signedAuthToken) {
			if (!authToken) {
				const extractedAuthToken = extractAuthTokenData(signedAuthToken);
			
				if (typeof extractedAuthToken === 'string') {
					throw new InvalidArgumentsError('Invalid authToken.');
				}
	
				authToken = extractedAuthToken;
			}

			this._authToken = authToken;
			this._signedAuthToken = signedAuthToken;

			return true;
		}

		return false;
	}

	public triggerAuthenticationEvents(wasSigned: boolean, wasAuthenticated: boolean): void {
		this._socket.emit(
			'authStateChange',
			{ wasAuthenticated, isAuthenticated: true, authToken: this._authToken, signedAuthToken: this._signedAuthToken }
		);

		this._socket.emit(
			'authenticate',
			{ wasSigned, signedAuthToken: this._signedAuthToken, authToken:this._authToken }
		);

		for (const middleware of this.middleware) {
			if (middleware.onAuthenticated) {
				middleware.onAuthenticated({ socket: this.socket, transport: this });
			}
		}
	}

	protected onClose(code: number, reason?: Buffer | string): void {
		const prevStatus = this.status;
		this.webSocket = null;
		this._isReady = false;

		clearTimeout(this._pingTimeoutRef);

		this.abortAllPendingCallbacksDueToBadConnection(prevStatus);

		for (const middleware of this.middleware) {
			if (middleware.onClose) {
				middleware.onClose({ socket: this.socket, transport: this });
			}
		}

		if (!socketProtocolIgnoreStatuses[code]) {
			let closeMessage: string;

			if (typeof reason === 'string') {
				closeMessage = `Socket connection closed with status code ${code} and reason: ${reason}`;
			} else {
				closeMessage = `Socket connection closed with status code ${code}`;
			}

			this.onError(new SocketProtocolError(socketProtocolErrorStatuses[code] || closeMessage, code));
		}

		const strReason = reason?.toString() || socketProtocolErrorStatuses[code];

		this._socket.emit('close', { code, reason: strReason });
	}

	protected onDisconnect(status: SocketStatus, code: number, reason?: string): void {
		if (status === 'ready') {
			this._socket.emit('disconnect', { code, reason });
		} else {
			this._socket.emit('connectAbort', { code, reason });
		}

		for (const middleware of this.middleware) {
			if (middleware.onDisconnected) {
				middleware.onDisconnected({ socket: this.socket, transport: this, status, code, reason });
			}
		}
	}

	public onError(error: Error): void {
		this._socket.emit('error', { error });
	}

	protected onUpgrade(request: IncomingMessage): void {
		this._socket.emit('upgrade', { request });
	}

	protected onMessage(data: ws.RawData, isBinary: boolean): void {
		let message = isBinary ? data : data.toString();

		this._socket.emit('message', { data, isBinary });

		const packet: AnyPacket<T['Service'], T['Incoming']> | 
			AnyResponse<T['Service'], T['Outgoing'], T['PrivateOutgoing']> |
			(AnyPacket<T['Service'], T['Incoming']> | AnyResponse<T['Service'], T['Outgoing'], T['PrivateOutgoing']>)[] | null
				= this.decode(message);

		if (packet === null) {
			return;
		}

		if (Array.isArray(packet)) {
			for (const curPacket of packet) {
				if ('rid' in curPacket) {
					this.onResponse(curPacket);
				} else {
					this.onRequest(curPacket);
				}
			}
		} else if (typeof packet === 'object') {
			if ('rid' in packet) {
				this.onResponse(packet);
			} else {
				this.onRequest(packet);
			}	
		}
	}

	protected onOpen(): void {
		// Placeholder for inherited classes
		for (const middleware of this.middleware) {
			if (middleware.onOpen) {
				middleware.onOpen({ socket: this.socket, transport: this });
			}
		}
	}
	
	protected onPing(data: Buffer): void {
		this._socket.emit('ping', { data });
	}

	protected onPong(data: Buffer): void {
		this._socket.emit('pong', { data });
	}

	protected onResponse(response: AnyResponse<T['Service'], T['Outgoing'], T['PrivateOutgoing']>) {
		const map = this._callbackMap[response.rid];

		if (map) {
			if (map.timeoutId) {
				clearTimeout(map.timeoutId);
				delete map.timeoutId;
			}

			if ('error' in response) {
				map.callback(response.error);
			} else {
				map.callback(null, 'data' in response ? response.data : undefined);
			}
		}

		this._socket.emit('response', { response });
	}

	protected onRequest(packet: AnyPacket<T['Service'], T['Incoming']>): boolean {
		packet.requestedAt = new Date();

		this._socket.emit('request', { request: packet });
		
		const timeoutAt = typeof packet.ackTimeoutMs === 'number' ? new Date(packet.requestedAt.valueOf() + packet.ackTimeoutMs) : null;
		let wasHandled = false;

		const handler = this._handlers[(packet as MethodPacket<T['Incoming']>).method];

		if (handler) {
			wasHandled = true;

			handler(
				new RequestHandlerArgs({
					isRpc: !!packet.cid,
					method: packet.method.toString(),
					timeoutMs: packet.ackTimeoutMs,
					socket: this._socket,
					transport: this,
					options: packet.data
				})
			).then(data => {
				if (packet.cid) {
					this.sendResponse([
						{
							rid: packet.cid,
							timeoutAt,
							data
						} as MethodDataResponse<T['Incoming']>
					]);
				}
			}).catch(error => {
				if (packet.cid) {
					this.sendResponse([
						{
							rid: packet.cid,
							timeoutAt,
							error
						}
					]);
				}

				this.onError(error);
			});
		}

		if (!wasHandled) {
			wasHandled = this.onUnhandledRequest(packet);
		}

		return wasHandled;
	}

	protected onUnexpectedResponse(request: ClientRequest, response: IncomingMessage): void {
		this._socket.emit('unexpectedResponse', { request, response });
	}

	protected onUnhandledRequest(packet: AnyPacket<T['Service'], T['Incoming']>): boolean {
		if (this._onUnhandledRequest) {
			return this._onUnhandledRequest(this, packet);
		}

		return false;
	}

	protected resetPingTimeout(timeoutMs: number | false, code: number) {
		if (this._pingTimeoutRef) {
			clearTimeout(this._pingTimeoutRef);
		}

		if (timeoutMs !== false) {
			// Use `WebSocket#terminate()`, which immediately destroys the connection,
			// instead of `WebSocket#close()`, which waits for the close timer.
			// Delay should be equal to the interval at which your server
			// sends out pings plus a conservative assumption of the latency.
			this._pingTimeoutRef = setTimeout(() => {
				this.webSocket.close(code);
			}, timeoutMs);
		}
	}

	public setReadyStatus(authError?: Error): void {
		if (this._webSocket?.readyState !== ws.OPEN) {
			throw new InvalidActionError('Cannot set status to OPEN before socket is connected.');
		}

		this._isReady = true;

		for (const middleware of this.middleware) {
			if (middleware.onReady) {
				middleware.onReady({ socket: this.socket, transport: this });
			}
		}

		this._socket.emit('connect', { isAuthenticated: !!this.signedAuthToken, authError });
	}

	public get status(): SocketStatus {
		if (!this._webSocket) {
			return 'closed';
		}

		if (this._isReady) {
			return 'ready';
		}

		switch (this._webSocket.readyState) {
			case ws.CONNECTING:
			case ws.OPEN:
				return 'connecting';				
			case ws.CLOSING:
				return 'closing';
		
			default:
				return 'closed';
		}
	}

	public send(data: Buffer | string): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this._webSocket.send(
					data,
					(err) => {
						if (err) {
							reject(err);
							return;
						}

						resolve();
					}
				);
			} catch (err) {
				throw err;
			}
		});
	}

	protected sendRequest(requests: (AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>)[]): void;
	protected sendRequest(index: number, requests: (AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>)[]): void;
	protected sendRequest(index: (AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>)[] | number, requests?: (AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>)[]): void {
		if (typeof index === 'object') {
			requests = index;
			index = 0;
		}

		// Filter out any requests that have already timed out.
		if (requests.some(request => 'callback' in request && request.callback === null)) {
			requests = requests.filter(
				request => !('callback' in request) || request.callback !== null
			);

			if (!requests.length) {
				return;
			}
		}

		const bypassRequests: AnyRequest<T['Service'], T['PrivateOutgoing'], T['Outgoing']>[] = [];

		for (let i = 0; i < requests.length; i++) {
			if (requests[i].bypassMiddleware) {
				bypassRequests.push(...requests.splice(i, 1));
				i--;
			}
		}

		if (requests.length) {
			for (; index < this.middleware.length; index++) {
				const middleware = this.middleware[index];

				if ('sendRequest' in middleware) {
					index++;

					try {
						this.callMiddleware(
							middleware,
							() => {
								middleware.sendRequest({
									socket: this.socket,
									transport: this,
									requests,
									cont: this.sendRequest.bind(this, index)
								});
							}
						);
					} catch (err) {
						for (const req of requests) {
							if (req.sentCallback) {
								req.sentCallback(err);
							}

							if ('callback' in req) {
								req.callback(err);
							}
						}
					}
		
					if (!bypassRequests.length) {
						return;
					}

					requests = [];

					break;
				}
			}
		}

		if (!requests.length) {
			requests = bypassRequests;
		} else if (bypassRequests.length) {
			requests = requests.concat(bypassRequests);
		}

		// If the socket is closed we need to call them back with an error.
		if (this.status === 'closed') {
			for (const request of requests) {
				const err = new BadConnectionError(
					`Socket invoke ${String(request.method)} event was aborted due to a bad connection`,
					'connectAbort'
				);

				this.onError(err);

				if ('sentCallback' in request && request.sentCallback) {
					request.sentCallback(err);
				}

				if ('callback' in request && request.callback) {
					request.callback(err);
				}
			}
			return;
		}

		const encode = requests.map(req => {
			if ('callback' in req) {
				const { callback, timeoutId, ...rest } = req;

				this._callbackMap[req.cid] = {
					method: ['service' in req ? req.service : '', req.method].filter(Boolean).join('.'),
					timeoutId: req.timeoutId,
					callback: req.callback
				};
				
				return rest;
			}

			return req;
		});

		this._webSocket.send(
			this.codecEngine.encode(encode.length === 1 ? encode[0] : encode),
			(err: WebSocketError) => {
				for (const req of requests) {
					if (err?.code === 'ECONNRESET') {
						err = new BadConnectionError(
							`Socket ${req.sentCallback ? 'transmit' : 'invoke' } ${String(req.method)} event was aborted due to a bad connection`,
							'connectAbort'
						);
					}

					if (req.sentCallback) {
						req.sentCallback(err);
					}

					if (err && 'callback' in req) {
						req.callback(err);
					}
				}
			}
		);
	}

	protected sendResponse(responses: (AnyResponse<T['Service'], T['Incoming']>)[]): void;
	protected sendResponse(index: number, responses: (AnyResponse<T['Service'], T['Incoming']>)[]): void;
	protected sendResponse(index: (AnyResponse<T['Service'], T['Incoming']>)[] | number, responses?: (AnyResponse<T['Service'], T['Incoming']>)[]): void {
		if (typeof index === 'object') {
			responses = index;
			index = 0;
		}

		// Remove any response that has timed out
		if (!(responses = responses.filter(item => !item.timeoutAt || item.timeoutAt > new Date())).length) {
			return;
		}

		for (; index < this.middleware.length; index++) {
			const middleware = this.middleware[index];

			if ('sendResponse' in middleware) {
				index++;

				try {
					this.callMiddleware(
						middleware,
						() => {
							middleware.sendResponse({
								socket: this.socket,
								transport: this,
								responses,
								cont: this.sendResponse.bind(this, index)
							});
						}
					);
				} catch (err) {
					this.sendResponse(
						index, responses.map(item => ({ rid: item.rid, timeoutAt: item.timeoutAt, error: err }))
					);
				}
	
				return;
			}
		}

		// If the socket is closed we need to call them back with an error.
		if (this.status === 'closed') {
			for (const response of responses) {
				// TODO: Use specific error
				this.onError(new Error());				
			}
			return;
		}

		for (const response of responses) {
			if ('error' in response) {
				response.error = dehydrateError(response.error);
			}

			delete response.timeoutAt;
		}

		//timeoutId?: NodeJS.Timeout;
		//callback: (err: Error, result?: U) => void | null
		this._webSocket.send(
			this.codecEngine.encode(responses.length === 1 ? responses[0] : responses),
			(err) => {
				if (err) {
					this.onError(err);
				}
			}
		);
	}

	public transmit<TMethod extends keyof T['Outgoing']>(
		method: TMethod, arg?: Parameters<T['Outgoing'][TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	public transmit<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: [TService, TMethod], arg?: Parameters<T['Service'][TService][TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	public transmit<TMethod extends keyof T['PrivateOutgoing']>(
		method: TMethod, arg?: Parameters<T['PrivateOutgoing'][TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	public transmit<
		TService extends keyof T['Service'],
		TServiceMethod extends keyof T['Service'][TService],
		TMethod extends keyof T['Outgoing']
	>(
		serviceAndMethod: TMethod | [TService, TServiceMethod],
		arg?: (Parameters<T['Outgoing'][TMethod] | T['Service'][TService][TServiceMethod]>)[0],
		bypassMiddleware?: boolean
	 ): Promise<void> {
		let service: TService;
		let serviceMethod: TServiceMethod;
		let method: TMethod;
	
		if (Array.isArray(serviceAndMethod)) {
			service = serviceAndMethod[0];
			serviceMethod = serviceAndMethod[1];
		} else {
			method = serviceAndMethod;
		}

		const request: TransmitMethodRequest<T['Outgoing'], TMethod> | TransmitServiceRequest<T['Service'], TService, TServiceMethod> = 
			Object.assign(
				{
					bypassMiddleware: !!bypassMiddleware
				},
				service ? {
					service,
					method: serviceMethod,
					data: arg as Parameters<T['Service'][TService][TServiceMethod]>[0]
				} : {
					method,
					data: arg as Parameters<T['Outgoing'][TMethod]>[0]
				}
			);

		const promise = new Promise<void>((resolve, reject) => {
			request.sentCallback = (err?: Error) => {
				request.sentCallback = null;

				if (err) {
					reject(err);
					return;
				}

				resolve();
			};
		});
	
		this.sendRequest([request as any]);

		return promise;
	}

	public invoke<TMethod extends keyof T['Outgoing']>(
		method: TMethod, arg?: Parameters<T['Outgoing'][TMethod]>[0], bypassMiddleware?: boolean): [Promise<FunctionReturnType<T['Outgoing'][TMethod]>>, () => void];
	public invoke<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: [TService, TMethod, (number | false)?], arg?: Parameters<T['Service'][TService][TMethod]>[0], bypassMiddleware?: boolean): [Promise<FunctionReturnType<T['Service'][TService][TMethod]>>, () => void];
	public invoke<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: InvokeServiceOptions<T['Service'], TService, TMethod>, arg?: Parameters<T['Service'][TService][TMethod]>[0], bypassMiddleware?: boolean): [Promise<FunctionReturnType<T['Service'][TService][TMethod]>>, () => void];
	public invoke<TMethod extends keyof T['Outgoing']>(
		options: InvokeMethodOptions<T['Outgoing'], TMethod>, arg?: Parameters<T['Outgoing'][TMethod]>[0], bypassMiddleware?: boolean): [Promise<FunctionReturnType<T['Outgoing'][TMethod]>>, () => void];
	public invoke<TMethod extends keyof T['PrivateOutgoing']>(
		method: TMethod, arg: Parameters<T['PrivateOutgoing'][TMethod]>[0], bypassMiddleware?: boolean): [Promise<FunctionReturnType<T['PrivateOutgoing'][TMethod]>>, () => void];
	public invoke<TMethod extends keyof T['PrivateOutgoing']>(
		options: InvokeMethodOptions<T['PrivateOutgoing'], TMethod>, arg?: Parameters<T['PrivateOutgoing'][TMethod]>[0], bypassMiddleware?: boolean): [Promise<FunctionReturnType<T['PrivateOutgoing'][TMethod]>>, () => void];
	public invoke<
		TService extends keyof T['Service'],
		TServiceMethod extends keyof T['Service'][TService],
		TMethod extends keyof T['Outgoing'],
		TPrivateMethod extends keyof T['PrivateOutgoing']
	> (
		methodOptions: TMethod | TPrivateMethod | [TService, TServiceMethod, (number | false)?] | InvokeServiceOptions<T['Service'], TService, TServiceMethod> | InvokeMethodOptions<T['Outgoing'], TMethod> | InvokeMethodOptions<T['PrivateOutgoing'], TPrivateMethod>,
		arg?: (Parameters<T['Outgoing'][TMethod] | T['PrivateOutgoing'][TPrivateMethod] | T['Service'][TService][TServiceMethod]>)[0],
		bypassMiddleware?: boolean
	): [Promise<FunctionReturnType<T['Service'][TService][TServiceMethod] | T['Outgoing'][TMethod] | T['PrivateOutgoing'][TPrivateMethod]>>, () => void] {

		let service: TService;
		let serviceMethod: TServiceMethod;
		let method: TMethod | TPrivateMethod;
		let ackTimeoutMs: number | false;

		if (typeof methodOptions === 'object') {
			if (Array.isArray(methodOptions)) {
				service = methodOptions[0];
				serviceMethod = methodOptions[1];
				ackTimeoutMs = methodOptions[2];
			} else {
				if ('service' in methodOptions) {
					service = methodOptions.service;
					serviceMethod = methodOptions.method;
				} else {
					method = methodOptions.method;
				}

				ackTimeoutMs = methodOptions.ackTimeoutMs;
			}
		} else {
			method = methodOptions;
		}

		let callbackMap = this._callbackMap;

		const request: InvokeMethodRequest<T['Outgoing'], TMethod> | InvokeMethodRequest<T['PrivateOutgoing'], TPrivateMethod> | InvokeServiceRequest<T['Service'], TService, TServiceMethod> = 
			Object.assign(
				{
					cid: this._callIdGenerator(),
					ackTimeoutMs: ackTimeoutMs ?? this.ackTimeoutMs,
					callback: null,
					bypassMiddleware: !!bypassMiddleware
				},
				service ? {
					service,
					method: serviceMethod,
					data: arg as Parameters<T['Service'][TService][TServiceMethod]>[0]
				} : {
					method: method as TMethod,
					data: arg as Parameters<T['Outgoing'][TMethod]>[0]
				}
			);

		let abort: () => void;

		const promise = new Promise<FunctionReturnType<T['Service'][TService][TServiceMethod] | T['Outgoing'][TMethod] | T['PrivateOutgoing'][TPrivateMethod]>>((resolve, reject) => {
			if (request.ackTimeoutMs) {
				request.timeoutId = setTimeout(
					() => {
						delete callbackMap[request.cid];
						request.callback = null;
						clearTimeout(request.timeoutId);
						reject(new TimeoutError(`Method \'${[service, request.method].filter(Boolean).join('.')}\' timed out.`));
					},
					request.ackTimeoutMs
				);
			}

			abort = () => {
				delete callbackMap[request.cid];

				if (request.timeoutId) {
					clearTimeout(request.timeoutId);
				}

				if (request.callback) {
					request.callback = null;
					reject(new AbortError(`Method \'${[service, request.method].filter(Boolean).join('.')}\' was aborted.`));
				}
			}

			request.callback = (err: Error, result: FunctionReturnType<T['Service'][TService][TServiceMethod] | T['Outgoing'][TMethod]>) => {
				delete callbackMap[request.cid];
				request.callback = null;

				if (request.timeoutId) {
					clearTimeout(request.timeoutId);
				}

				if (err) {
					reject(err);
					return;
				}

				resolve(result);
			};
		});

		this.sendRequest([request as any]);

		return [promise, abort];
	}

	public get url(): string {
		return this._webSocket.url;
	}

	protected get webSocket(): ws.WebSocket {
		return this._webSocket;
	}
	
	protected set webSocket(value: ws.WebSocket | null) {
		if (this._webSocket) {
			this._webSocket.off('open', this.onOpen);
			this._webSocket.off('close', this.onClose);
			this._webSocket.off('error', this.onError);
			this._webSocket.off('upgrade', this.onUpgrade);
			this._webSocket.off('message', this.onMessage);
			this._webSocket.off('ping', this.onPing);
			this._webSocket.off('pong', this.onPong);
			this._webSocket.off('unexpectedResponse', this.onUnexpectedResponse);

			delete this.onOpen;
			delete this.onClose;
			delete this.onError;
			delete this.onUpgrade;
			delete this.onMessage;
			delete this.onPing;
			delete this.onPong;
			delete this.onUnexpectedResponse;
		}

		this._webSocket = value;

		if (value) {
			this._webSocket.on('open', this.onOpen = this.onOpen.bind(this));
			this._webSocket.on('close', this.onClose = this.onClose.bind(this));
			this._webSocket.on('error', this.onError = this.onError.bind(this));
			this._webSocket.on('upgrade', this.onUpgrade = this.onUpgrade.bind(this));
			this._webSocket.on('message', this.onMessage = this.onMessage.bind(this));
			this._webSocket.on('ping', this.onPing = this.onPing.bind(this));
			this._webSocket.on('pong', this.onPong = this.onPong.bind(this));
			this._webSocket.on('unexpectedResponse', this.onUnexpectedResponse = this.onUnexpectedResponse.bind(this));
		}
	}	
}