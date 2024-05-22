import defaultCodec, { CodecEngine } from "@socket-mesh/formatter";
import ws from "isomorphic-ws";
import { AnyMiddleware, Middleware } from "./middleware/middleware.js";
import { AnyPacket, AnyRequest, InvokeMethodRequest, InvokeServiceRequest, MethodPacket, TransmitMethodRequest, TransmitServiceRequest } from "./request.js";
import { AbortError, BadConnectionError, InvalidActionError, InvalidArgumentsError, MiddlewareBlockedError, MiddlewareCaughtError, MiddlewareError, SocketProtocolError, TimeoutError, dehydrateError, socketProtocolErrorStatuses, socketProtocolIgnoreStatuses } from "@socket-mesh/errors";
import { ClientRequest, IncomingMessage } from "http";
import { PublicMethodMap, FunctionReturnType, MethodMap, ServiceMap } from "./client/maps/method-map.js";
import { AnyResponse, MethodDataResponse } from "./response.js";
import { HandlerMap } from "./client/maps/handler-map.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { Socket, SocketStatus } from "./socket.js";
import base64id from "base64id";
import { RequestHandlerArgs } from "./request-handler.js";
import { AbortablePromise } from "./utils.js";

export type CallIdGenerator = () => number;

export interface SocketOptions<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object,
	TSocket extends Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState> = Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>
> {
	ackTimeoutMs?: number,
	id?: string,
	callIdGenerator?: CallIdGenerator,
	handlers?: HandlerMap<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	onUnhandledRequest?: (socket: TSocket, packet: AnyPacket<TServiceMap, TIncomingMap>) => boolean,
	codecEngine?: CodecEngine,
	middleware?: AnyMiddleware<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>[],
	state?: TSocketState
}

export interface InvokeMethodOptions<TMethodMap extends MethodMap<TMethodMap>, TMethod extends keyof TMethodMap> {
	method: TMethod,
	ackTimeoutMs?: number | false
}

export interface InvokeServiceOptions<TServiceMap extends ServiceMap<TServiceMap>, TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]> {
	service: TService,
	method: TMethod,
	ackTimeoutMs?: number | false
}

interface InvokeCallback<T> {
	method: string,
	timeoutId?: NodeJS.Timeout,
	callback: (err: Error, result?: T) => void
}

export class SocketTransport<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object
> {
	private _socket: Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	private _webSocket: ws.WebSocket;
	private _isOpen: boolean;
	private _authToken?: AuthToken;
	private _signedAuthToken?: SignedAuthToken;
	private readonly _callIdGenerator: CallIdGenerator;
	private readonly _callbackMap: {[cid: number]: InvokeCallback<unknown>};
	private _handlers: HandlerMap<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	private _onUnhandledRequest: (socket: this, packet: AnyPacket<TServiceMap, TIncomingMap>) => boolean;
	public readonly codecEngine: CodecEngine;
	public readonly middleware: AnyMiddleware<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>[];
	public readonly state: Partial<TSocketState>;
	public id: string;
	public ackTimeoutMs: number;

	protected constructor(
		options?: SocketOptions<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>
	) {
		let cid = 1;

		this.id = (options?.id || base64id.generateId());
		this.ackTimeoutMs = options?.ackTimeoutMs ?? 10000;
		this.codecEngine = options?.codecEngine || defaultCodec;
		this._callbackMap = {};
		this._handlers = options?.handlers || {};
		this.state = options?.state || {};

		this._callIdGenerator = options?.callIdGenerator || (() => {
			return cid++;
		});

		this.middleware = options?.middleware || [];
	}

	public disconnect(code=1000, reason?: string): void {
		if (this.webSocket) {
			const status = this.status;

			this.webSocket.close(code);
			this.onDisconnect(status, code, reason);
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

	public get socket(): Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState> {
		return this._socket;
	}

	public set socket(value: Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>) {
		this._socket = value;
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

	public get authToken(): AuthToken {
		return this._authToken;
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
				authToken = this.extractAuthTokenData(signedAuthToken);
			}

			const wasAuthenticated = !!this._signedAuthToken;

			this._authToken = authToken;
			this._signedAuthToken = signedAuthToken;

			this._socket.emit('authStateChange', { wasAuthenticated, isAuthenticated: true, authToken, signedAuthToken });
			this._socket.emit('authenticate', { signedAuthToken, authToken });

			for (const middleware of this.middleware) {
				if (middleware.onAuthenticate) {
					middleware.onAuthenticate();
				}	
			}

			return true;
		}

		return false;
	}

	private extractAuthTokenData(signedAuthToken: SignedAuthToken): any {
		if (typeof signedAuthToken !== 'string') return null;

		let tokenParts = signedAuthToken.split('.');
		let encodedTokenData = tokenParts[1];

		if (encodedTokenData != null) {
			let tokenData = encodedTokenData;

			try {
				tokenData = Buffer.from(tokenData, 'base64').toString('utf8')
				return JSON.parse(tokenData);
			} catch (e) {
				return tokenData;
			}
		}

		return null;
	}
	
	public async deauthenticate(): Promise<boolean> {
		if (this._signedAuthToken) {
			const authToken = this._authToken;
			const signedAuthToken = this._signedAuthToken;

			this._authToken = null;
			this._signedAuthToken = null;	

			this._socket.emit('authStateChange', { wasAuthenticated: true, isAuthenticated: false, authToken, signedAuthToken });
			this._socket.emit('deauthenticate', { signedAuthToken, authToken });

			for (const middleware of this.middleware) {
				if (middleware.onDeauthenticate) {
					middleware.onDeauthenticate();
				}	
			}

			return true;
		}

		return false;
	}

	protected onOpen(): void {
		// Placeholder for inherited classes
	}

	protected onClose(code: number, reason?: Buffer | string): void {
		this.webSocket = null;
		this._isOpen = false;

		for (const middleware of this.middleware) {
			if (middleware.onClose) {
				middleware.onClose();
			}
		}

		if (!socketProtocolIgnoreStatuses[code]) {
			let closeMessage: string;

			if (typeof reason === 'string') {
				closeMessage = 'Socket connection closed with status code ' + code + ' and reason: ' + reason;
			} else {
				closeMessage = 'Socket connection closed with status code ' + code;
			}

			this.onError(new SocketProtocolError(socketProtocolErrorStatuses[code] || closeMessage, code));
		}

		const strReason = reason?.toString() || socketProtocolErrorStatuses[code];

		this._socket.emit('close', { code, reason: strReason });
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

		let packet: AnyPacket<TServiceMap, TIncomingMap> | AnyResponse<TServiceMap, TOutgoingMap, TPrivateOutgoingMap> |
			(AnyPacket<TServiceMap, TIncomingMap> | AnyResponse<TServiceMap, TOutgoingMap, TPrivateOutgoingMap>)[];

		try {
			packet = this.codecEngine.decode(message as string);
		} catch (err) {
			if (err.name === 'Error') {
				err.name = 'InvalidMessageError';
			}

			this.onError(err);
			return;
		}

		if (Array.isArray(packet)) {
			for (const curPacket of packet) {
				if ('rid' in curPacket) {
					this.onResponse(curPacket);
				} else {
					this.onRequest(curPacket);
					this._socket.emit('request', { request: curPacket });
				}
			}
		} else {
			if ('rid' in packet) {
				this.onResponse(packet);
			} else {
				this.onRequest(packet);
				this._socket.emit('request',  { request: packet });
			}
		}
	}

	protected onPing(data: Buffer): void {
		this._socket.emit('ping', { data });
	}

	protected onPong(data: Buffer): void {
		this._socket.emit('pong', { data });
	}

	protected onRequest(packet: AnyPacket<TServiceMap, TIncomingMap>): boolean {
		packet.requestedAt = new Date();
		
		const timeoutAt = typeof packet.ackTimeoutMs === 'number' ? new Date(packet.requestedAt.valueOf() + packet.ackTimeoutMs) : null;
		let wasHandled = false;

		const handler = this._handlers[(packet as MethodPacket<TIncomingMap>).method];

		if (handler) {
			wasHandled = true;

			handler(
				new RequestHandlerArgs({
					method: packet.method.toString(),
					timeoutMs: packet.ackTimeoutMs,
					socket: this._socket,
					transport: this,
					options: packet.data
				})
			).then(data => {
				this.sendResponse([
					{
						rid: packet.cid,
						timeoutAt,
						data
					} as MethodDataResponse<TIncomingMap>
				])
			}).catch(error => {
				this.sendResponse([
					{
						rid: packet.cid,
						timeoutAt,
						error
					}
				]);

				this.onError(error);
			});
		}

		if (!wasHandled) {
			wasHandled = this.onUnhandledRequest(packet);
		}

		return wasHandled;
	}

	protected onUnhandledRequest(packet: AnyPacket<TServiceMap, TIncomingMap>): boolean {
		if (this._onUnhandledRequest) {
			return this._onUnhandledRequest(this, packet);
		}

		return false;
	}

	protected onResponse(response: AnyResponse<TServiceMap, TOutgoingMap, TPrivateOutgoingMap>) {
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

	protected onUnexpectedResponse(request: ClientRequest, response: IncomingMessage): void {
		this._socket.emit('unexpectedResponse', { request, response });
	}

	protected onDisconnect(status: SocketStatus, code: number, reason?: string): void {
		if (status === 'open') {
			this._socket.emit('disconnect', { code, reason });
		} else {
			this._socket.emit('connectAbort', { code, reason });
		}

		for (const middleware of this.middleware) {
			if (middleware.onDisconnect) {
				middleware.onDisconnect(status, code, reason);
			}
		}

		this.abortAllPendingEventsDueToDisconnect(status);
	}

	private abortAllPendingEventsDueToDisconnect(status: SocketStatus): void {
		for (const cid in this._callbackMap) {
			const map = this._callbackMap[cid];
			const msg = `Event ${map.method} was aborted due to a bad connection`;

			map.callback(
				new BadConnectionError(msg, status === 'open' ? 'disconnect' : 'connectAbort')
			);
		}
	}

	public callMiddleware(middleware: Middleware, fn: () => void): void {
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

	public get url(): string {
		return this._webSocket.url;
	}

	public get status(): SocketStatus {
		if (!this._webSocket) {
			return 'closed';
		}

		if (this._isOpen) {
			return 'open';
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

	public setOpenStatus(): void {
		if (this._webSocket?.readyState !== ws.OPEN) {
			throw new InvalidActionError('Cannot set status to OPEN before socket is connected.');
		}

		this._isOpen = true;

		for (const middleware of this.middleware) {
			if (middleware.onOpen) {
				middleware.onOpen();
			}
		}

		this._socket.emit('connect', { isAuthenticated: !!this.signedAuthToken });
	}

	protected sendRequest(requests: (AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>)[]): void;
	protected sendRequest(index: number, requests: (AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>)[]): void;
	protected sendRequest(index: (AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>)[] | number, requests?: (AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>)[]): void {
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

		const bypassRequests: AnyRequest<TServiceMap, TPrivateOutgoingMap, TOutgoingMap>[] = [];

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
								middleware.sendRequest(
									requests,
									this.sendRequest.bind(this, index)
								);
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
				if ('callback' in request && request.callback) {
					//TODO:
					request.callback(new Error('socket closed'));
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
			(err) => {
				for (const req of requests) {
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

	protected sendResponse(responses: (AnyResponse<TServiceMap, TIncomingMap>)[]): void;
	protected sendResponse(index: number, responses: (AnyResponse<TServiceMap, TIncomingMap>)[]): void;
	protected sendResponse(index: (AnyResponse<TServiceMap, TIncomingMap>)[] | number, responses?: (AnyResponse<TServiceMap, TIncomingMap>)[]): void {
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
							middleware.sendResponse(
								responses,
								this.sendResponse.bind(this, index)
							);
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

	public transmit<TMethod extends keyof TOutgoingMap>(
		method: TMethod, arg?: Parameters<TOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	public transmit<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(
		options: [TService, TMethod], arg?: Parameters<TServiceMap[TService][TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	public transmit<TMethod extends keyof TPrivateOutgoingMap>(
		method: TMethod, arg?: Parameters<TPrivateOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	public transmit<
		TService extends keyof TServiceMap,
		TServiceMethod extends keyof TServiceMap[TService],
		TMethod extends keyof TOutgoingMap
	>(
		serviceAndMethod: TMethod | [TService, TServiceMethod],
		arg?: (Parameters<TOutgoingMap[TMethod] | TServiceMap[TService][TServiceMethod]>)[0],
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

		const request: TransmitMethodRequest<TOutgoingMap, TMethod> | TransmitServiceRequest<TServiceMap, TService, TServiceMethod> = 
			Object.assign(
				{
					cid: this._callIdGenerator(),
					bypassMiddleware: !!bypassMiddleware
				},
				service ? {
					service,
					method: serviceMethod,
					data: arg as Parameters<TServiceMap[TService][TServiceMethod]>[0]
				} : {
					method,
					data: arg as Parameters<TOutgoingMap[TMethod]>[0]
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

	public invoke<TMethod extends keyof TOutgoingMap>(
		method: TMethod, arg?: Parameters<TOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TOutgoingMap[TMethod]>>;
	public invoke<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(
		options: [TService, TMethod, (number | false)?], arg?: Parameters<TServiceMap[TService][TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TServiceMap[TService][TMethod]>>;
	public invoke<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(
		options: InvokeServiceOptions<TServiceMap, TService, TMethod>, arg?: Parameters<TServiceMap[TService][TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TServiceMap[TService][TMethod]>>;
	public invoke<TMethod extends keyof TOutgoingMap>(
		options: InvokeMethodOptions<TOutgoingMap, TMethod>, arg?: Parameters<TOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TOutgoingMap[TMethod]>>;
	public invoke<TMethod extends keyof TPrivateOutgoingMap>(
		method: TMethod, arg: Parameters<TPrivateOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TPrivateOutgoingMap[TMethod]>>;
	public invoke<TMethod extends keyof TPrivateOutgoingMap>(
		options: InvokeMethodOptions<TPrivateOutgoingMap, TMethod>, arg?: Parameters<TPrivateOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TPrivateOutgoingMap[TMethod]>>;
	public invoke<
		TService extends keyof TServiceMap,
		TServiceMethod extends keyof TServiceMap[TService],
		TMethod extends keyof TOutgoingMap,
		TPrivateMethod extends keyof TPrivateOutgoingMap
	> (
		methodOptions: TMethod | TPrivateMethod | [TService, TServiceMethod, (number | false)?] | InvokeServiceOptions<TServiceMap, TService, TServiceMethod> | InvokeMethodOptions<TOutgoingMap, TMethod> | InvokeMethodOptions<TPrivateOutgoingMap, TPrivateMethod>,
		arg?: (Parameters<TOutgoingMap[TMethod] | TPrivateOutgoingMap[TPrivateMethod] | TServiceMap[TService][TServiceMethod]>)[0],
		bypassMiddleware?: boolean
	): AbortablePromise<FunctionReturnType<TServiceMap[TService][TServiceMethod] | TOutgoingMap[TMethod] | TPrivateOutgoingMap[TPrivateMethod]>> {

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

		const request: InvokeMethodRequest<TOutgoingMap, TMethod> | InvokeMethodRequest<TPrivateOutgoingMap, TPrivateMethod> | InvokeServiceRequest<TServiceMap, TService, TServiceMethod> = 
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
					data: arg as Parameters<TServiceMap[TService][TServiceMethod]>[0]
				} : {
					method: method as TMethod,
					data: arg as Parameters<TOutgoingMap[TMethod]>[0]
				}
			);

		let abort: () => void;

		const promise = new Promise<FunctionReturnType<TServiceMap[TService][TServiceMethod] | TOutgoingMap[TMethod] | TPrivateOutgoingMap[TPrivateMethod]>>((resolve, reject) => {
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

			request.callback = (err: Error, result: FunctionReturnType<TServiceMap[TService][TServiceMethod] | TOutgoingMap[TMethod]>) => {
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

		return Object.assign(promise, { abort });
	}
}