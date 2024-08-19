import defaultCodec, { CodecEngine } from "@socket-mesh/formatter";
import ws from "isomorphic-ws";
import { Plugin } from "./plugins/plugin.js";
import { AnyRequest, InvokeMethodRequest, InvokeServiceRequest, TransmitMethodRequest, TransmitServiceRequest, abortRequest, isRequestDone } from "./request.js";
import { AnyPacket, MethodPacket, isRequestPacket } from "./packet.js";
import { AbortError, BadConnectionError, InvalidActionError, InvalidArgumentsError, PluginBlockedError, SocketProtocolError, TimeoutError, dehydrateError, hydrateError, socketProtocolErrorStatuses, socketProtocolIgnoreStatuses } from "@socket-mesh/errors";
import { ClientRequest, IncomingMessage } from "http";
import { FunctionReturnType, MethodMap, ServiceMap } from "./maps/method-map.js";
import { AnyResponse, MethodDataResponse, isResponsePacket } from "./response.js";
import { HandlerMap } from "./maps/handler-map.js";
import { AuthToken, extractAuthTokenData, SignedAuthToken } from "@socket-mesh/auth";
import { Socket, SocketOptions, SocketStatus, StreamCleanupMode } from "./socket.js";
import { RequestHandlerArgs } from "./request-handler.js";
import { SocketMap } from "./maps/socket-map.js";
import { toArray, wait } from "./utils.js";

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

export interface InboundMessage<T extends SocketMap> {
	timestamp: Date,
	packet: (AnyPacket<T> | AnyResponse<T>) | (AnyPacket<T> | AnyResponse<T>)[]
}

interface WebSocketError extends Error {
	code?: string
}

export class SocketTransport<T extends SocketMap> {
	private _socket: Socket<T>;
	private _webSocket: ws.WebSocket;
	private _inboundProcessedMessageCount: number;
	private _inboundReceivedMessageCount: number;
	private _outboundPreparedMessageCount: number;
	private _outboundSentMessageCount: number
	private _isReady: boolean;
	private _authToken?: AuthToken;
	private _signedAuthToken?: SignedAuthToken;
	private readonly _callIdGenerator: CallIdGenerator;
	private readonly _callbackMap: {[cid: number]: InvokeCallback<unknown>};
	private readonly _handlers: HandlerMap<T>;
	private _onUnhandledRequest: (socket: SocketTransport<T>, packet: AnyPacket<T>) => boolean;
	public readonly codecEngine: CodecEngine;
	public readonly plugins: Plugin<T>[];
	public streamCleanupMode: StreamCleanupMode;
	public id: string | null;
	public ackTimeoutMs: number;

	private _pingTimeoutRef: NodeJS.Timeout | null;

	protected constructor(options?: SocketOptions<T>) {
		let cid = 1;

		this.ackTimeoutMs = options?.ackTimeoutMs ?? 10000;

		this._callIdGenerator = options?.callIdGenerator || (() => {
			return cid++;
		});

		this._callbackMap = {};
		this.codecEngine = options?.codecEngine || defaultCodec;
		this._handlers = options?.handlers || {};
		this.id = null;
		this._inboundProcessedMessageCount = 0;
		this._inboundReceivedMessageCount = 0;
		this._outboundPreparedMessageCount = 0;
		this._outboundSentMessageCount = 0;
		this._pingTimeoutRef = null;
		this.plugins = options?.plugins || [];
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

			for (const plugin of this.plugins) {
				if (plugin.onDeauthenticate) {
					plugin.onDeauthenticate({ socket: this.socket, transport: this });
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
			this.webSocket.close(code, reason);
			this.onClose(code, reason);
		}
	}

	public getBackpressure(): number {
		return Math.max(
			this.getInboundBackpressure(),
			this.getOutboundBackpressure()
		);
	}

	public getInboundBackpressure(): number {
		return this._inboundReceivedMessageCount - this._inboundProcessedMessageCount;
	}

	public getOutboundBackpressure(): number {
		return this._outboundPreparedMessageCount - this._outboundSentMessageCount;
	}

	protected async handleInboudMessage({ packet, timestamp }: InboundMessage<T>): Promise<void> {
		if (packet === null) {
			return;
		}

		packet = toArray<AnyPacket<T> | AnyResponse<T>>(packet);

		for (let curPacket of packet) {
			let pluginError: Error;

			try {
				for (const plugin of this.plugins) {
					if (plugin.onMessage) {
						curPacket = await plugin.onMessage({ socket: this.socket, transport: this, packet: curPacket, timestamp: timestamp })
					}
				}					
			} catch (err) {
				pluginError = err;
			}

			// Check to see if it is a request or response packet. 
			if (isResponsePacket(curPacket)) {
				this.onResponse(curPacket, pluginError);
			} else if (isRequestPacket(curPacket)) {
				await this.onRequest(curPacket, timestamp, pluginError);
			} else {
				// TODO: Handle non packets here (binary data)
			}
		}
	}

	protected onClose(code: number, reason?: Buffer | string): void {
		const prevStatus = this.status;
		this.webSocket = null;
		this._isReady = false;

		clearTimeout(this._pingTimeoutRef);

		this._pingTimeoutRef = null;

		this.abortAllPendingCallbacksDueToBadConnection(prevStatus);

		for (const plugin of this.plugins) {
			if (plugin.onClose) {
				plugin.onClose({ socket: this.socket, transport: this });
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

		for (const plugin of this.plugins) {
			if (plugin.onDisconnected) {
				plugin.onDisconnected({ socket: this.socket, transport: this, status, code, reason });
			}
		}
	}

	public onError(error: Error): void {
		this._socket.emit('error', { error });
	}

	protected onInvoke<
		TService extends keyof T['Service'],
		TServiceMethod extends keyof T['Service'][TService],
		TMethod extends keyof T['Outgoing'],
		TPrivateMethod extends keyof T['PrivateOutgoing']
	>(
		request: InvokeMethodRequest<T["Outgoing"], TMethod> | InvokeMethodRequest<T["PrivateOutgoing"], TPrivateMethod> | InvokeServiceRequest<T["Service"], TService, TServiceMethod>
	): void {
		this.sendRequest([request as AnyRequest<T>]);
	}

	protected onMessage(data: ws.Data, isBinary: boolean): void {
		data = isBinary ? data : data.toString();

		if (data === '') {
			this.onPingPong();
			return;
		}

		const timestamp = new Date();
		let p = Promise.resolve(data);
		let resolve: () => void;
		let reject: (err: Error) => void;

		const promise = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});

		this._inboundReceivedMessageCount++;

		for (let i = 0; i < this.plugins.length; i++) {
			const plugin = this.plugins[i];

			if (plugin.onMessageRaw) {
				p = p.then(message => {
					return plugin.onMessageRaw({ socket: this.socket, transport: this, message, timestamp, promise })
				});	
			}
		}

		p.then(data => {
			const packet: (AnyPacket<T> | AnyResponse<T>) | (AnyPacket<T> | AnyResponse<T>)[] | null = this.decode(data);

			this._socket.emit('message', { data, isBinary });	
			return this.handleInboudMessage({ packet, timestamp });
		})
		.then(resolve)
		.catch(err => {
			reject(err);
			if (!(err instanceof PluginBlockedError)) {
				this.onError(err);
			}
		}).finally(() => {
			this._inboundProcessedMessageCount++;
		});
	}

	protected onOpen(): void {
		// Placeholder for inherited classes
		for (const plugin of this.plugins) {
			if (plugin.onOpen) {
				plugin.onOpen({ socket: this.socket, transport: this });
			}
		}
	}

	protected onPingPong(): void {}

	protected async onRequest(packet: AnyPacket<T>, timestamp: Date, pluginError?: Error): Promise<boolean> {
		this._socket.emit('request', { request: packet });
		
		const timeoutAt = typeof packet.ackTimeoutMs === 'number' ? new Date(timestamp.valueOf() + packet.ackTimeoutMs) : null;
		let wasHandled = false;

		let response: AnyResponse<T>;
		let error: Error;

		if (pluginError) {
			wasHandled = true;
			error = pluginError;
			response = { rid: packet.cid, timeoutAt, error: pluginError };
		} else {
			const handler = this._handlers[(packet as MethodPacket<T['Incoming']>).method];

			if (handler) {
				wasHandled = true;
	
				try {
					const data = await handler(
						new RequestHandlerArgs({
							isRpc: !!packet.cid,
							method: packet.method.toString(),
							timeoutMs: packet.ackTimeoutMs,
							socket: this._socket,
							transport: this,
							options: packet.data
						})
					);
					
					if (packet.cid) {
						response = { rid: packet.cid, timeoutAt, data } as MethodDataResponse<T['Incoming']>;
					}					
				} catch (err) {
					error = err;

					if (packet.cid) {
						response = { rid: packet.cid, timeoutAt, error };
					}
				}
			}
		}

		if (response) {
			this.sendResponse([response]);
		}

		if (error) {
			this.onError(error);
		}

		if (!wasHandled) {
			wasHandled = this.onUnhandledRequest(packet);
		}

		return wasHandled;
	}

	protected onResponse(response: AnyResponse<T>, pluginError?: Error) {
		const map = this._callbackMap[response.rid];

		if (map) {
			if (map.timeoutId) {
				clearTimeout(map.timeoutId);
				delete map.timeoutId;
			}

			if (pluginError) {
				map.callback(pluginError);
			} else if ('error' in response) {
				map.callback(hydrateError(response.error));
			} else {
				map.callback(null, 'data' in response ? response.data : undefined);
			}
		}

		if (pluginError) {
			this._socket.emit('response', { response: { rid: response.rid, error: pluginError } });
		} else {
			this._socket.emit('response', { response });
		}
	}

	private onSocketClose(event: ws.CloseEvent): void {
		this.onClose(event.code, event.reason);
	}

	private onSocketError(event: ws.ErrorEvent): void {
		this.onError(event.error);
	}

	private onSocketMessage(event: ws.MessageEvent): void {
		this.onMessage(event.data, false);
	}

	protected onTransmit<
		TService extends keyof T['Service'],
		TServiceMethod extends keyof T['Service'][TService],
		TMethod extends keyof T['Outgoing']
	>(
		request: TransmitMethodRequest<T['Outgoing'], TMethod> | TransmitServiceRequest<T['Service'], TService, TServiceMethod>
	): void {
		this.sendRequest([request as TransmitMethodRequest<T["Outgoing"], TMethod>]);
	}

	protected onUnhandledRequest(packet: AnyPacket<T>): boolean {
		if (this._onUnhandledRequest) {
			return this._onUnhandledRequest(this, packet);
		}

		return false;
	}

	protected resetPingTimeout(timeoutMs: number | false, code: number) {
		if (this._pingTimeoutRef) {
			clearTimeout(this._pingTimeoutRef);
			this._pingTimeoutRef = null;
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

	protected sendRequest(requests: (AnyRequest<T>)[]): void;
	protected sendRequest(index: number, requests: (AnyRequest<T>)[]): void;
	protected sendRequest(index: (AnyRequest<T>)[] | number, requests?: (AnyRequest<T>)[]): void {
		if (typeof index === 'object') {
			requests = index;
			index = 0;
		}

		// Filter out any requests that have already timed out.
		if (requests.some(request => isRequestDone(request))) {
			requests = requests.filter(req => isRequestDone(req));

			if (!requests.length) {
				return;
			}
		}

		for (; index < this.plugins.length; index++) {
			const plugin = this.plugins[index];

			if ('sendRequest' in plugin) {
				index++;

				try {
					plugin.sendRequest({
						socket: this.socket,
						transport: this,
						requests,
						cont: this.sendRequest.bind(this, index)
					});
				} catch (err) {
					for (const req of requests) {
						abortRequest(req, err);
					}
				}

				return;
			}
		}

		// If the socket is closed we need to call them back with an error.
		if (this.status === 'closed') {
			for (const req of requests) {
				const err = new BadConnectionError(
					`Socket ${'callback' in req ? 'invoke' : 'transmit' } ${String(req.method)} event was aborted due to a bad connection`,
					'connectAbort'
				);

				this.onError(err);

				abortRequest(req, err);
			}
			return;
		}

		const encode = requests.map(req => {
			if ('callback' in req) {
				const { callback, promise, timeoutId, ...rest } = req;

				this._callbackMap[req.cid] = {
					method: ['service' in req ? req.service : '', req.method].filter(Boolean).join('.'),
					timeoutId: req.timeoutId,
					callback: req.callback
				};

				return rest;
			}

			const { promise, ...rest } = req;

			return rest;
		});

		let sendErr: WebSocketError;

		this.send(
			this.codecEngine.encode(encode.length === 1 ? encode[0] : encode)
		).catch(err => {
			sendErr = err;
		}).then(() => {
			const errCode = sendErr?.code;

			for (const req of requests) {
				if (errCode === 'ECONNRESET') {
					sendErr = new BadConnectionError(
						`Socket ${'callback' in req ? 'invoke' : 'transmit' } ${String(req.method)} event was aborted due to a bad connection`,
						'connectAbort'
					);
				}

				if (req.sentCallback) {
					req.sentCallback(sendErr);
				}

				if (sendErr && 'callback' in req) {
					req.callback(sendErr);
				}
			}
		}).catch(err => {
			this.onError(err);
		});
	}

	protected sendResponse(responses: (AnyResponse<T>)[]): void;
	protected sendResponse(index: number, responses: (AnyResponse<T>)[]): void;
	protected sendResponse(index: (AnyResponse<T>)[] | number, responses?: (AnyResponse<T>)[]): void {
		if (typeof index === 'object') {
			responses = index;
			index = 0;
		}

		// Remove any response that has timed out
		if (!(responses = responses.filter(item => !item.timeoutAt || item.timeoutAt > new Date())).length) {
			return;
		}

		for (; index < this.plugins.length; index++) {
			const plugin = this.plugins[index];

			if ('sendResponse' in plugin) {
				index++;

				try {
					plugin.sendResponse({
						socket: this.socket,
						transport: this,
						responses,
						cont: this.sendResponse.bind(this, index)
					});
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
				this.onError(new Error(`WebSocket is not open: readyState 3 (CLOSED)`));
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
		this.send(
			this.codecEngine.encode(responses.length === 1 ? responses[0] : responses)
		).catch(err => {
			this.onError(err);
		});
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

	public setReadyStatus(pingTimeoutMs: number, authError?: Error): void {
		if (this._webSocket?.readyState !== ws.OPEN) {
			throw new InvalidActionError('Cannot set status to OPEN before socket is connected.');
		}

		this._isReady = true;

		for (const plugin of this.plugins) {
			if (plugin.onReady) {
				plugin.onReady({ socket: this.socket, transport: this });
			}
		}

		this._socket.emit('connect', { id: this.id, pingTimeoutMs, isAuthenticated: !!this.signedAuthToken, authError });
	}

	public get signedAuthToken(): SignedAuthToken {
		return this._signedAuthToken;
	}

	public get socket(): Socket<T> {
		return this._socket;
	}

	public set socket(value: Socket<T>) {
		this._socket = value;
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

	public triggerAuthenticationEvents(wasSigned: boolean, wasAuthenticated: boolean): void {
		this._socket.emit(
			'authStateChange',
			{ wasAuthenticated, isAuthenticated: true, authToken: this._authToken, signedAuthToken: this._signedAuthToken }
		);

		this._socket.emit(
			'authenticate',
			{ wasSigned, signedAuthToken: this._signedAuthToken, authToken:this._authToken }
		);

		for (const plugin of this.plugins) {
			if (plugin.onAuthenticated) {
				plugin.onAuthenticated({ socket: this.socket, transport: this });
			}
		}
	}

	public transmit<TMethod extends keyof T['Outgoing']>(
		method: TMethod, arg?: Parameters<T['Outgoing'][TMethod]>[0]): Promise<void>;
	public transmit<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: [TService, TMethod], arg?: Parameters<T['Service'][TService][TMethod]>[0]): Promise<void>;
	public transmit<TMethod extends keyof T['PrivateOutgoing']>(
		method: TMethod, arg?: Parameters<T['PrivateOutgoing'][TMethod]>[0]): Promise<void>;
	public transmit<
		TService extends keyof T['Service'],
		TServiceMethod extends keyof T['Service'][TService],
		TMethod extends keyof T['Outgoing']
	>(
		serviceAndMethod: TMethod | [TService, TServiceMethod],
		arg?: (Parameters<T['Outgoing'][TMethod] | T['Service'][TService][TServiceMethod]>)[0]
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
			service ? {
				service,
				method: serviceMethod,
				promise: null,
				data: arg as Parameters<T['Service'][TService][TServiceMethod]>[0]
			} : {
				data: arg as Parameters<T['Outgoing'][TMethod]>[0],
				method,
				promise: null
			};

		const promise = request.promise = new Promise<void>((resolve, reject) => {
			request.sentCallback = (err?: Error) => {
				delete request.sentCallback;
				this._outboundSentMessageCount++;

				if (err) {
					reject(err);
					return;
				}

				resolve();
			};
		});

		this._outboundPreparedMessageCount++;

		this.onTransmit(request as TransmitMethodRequest<T['Outgoing'], TMethod>);

		return promise;
	}

	public invoke<TMethod extends keyof T['Outgoing']>(
		method: TMethod, arg?: Parameters<T['Outgoing'][TMethod]>[0]): [Promise<FunctionReturnType<T['Outgoing'][TMethod]>>, () => void];
	public invoke<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: [TService, TMethod, (number | false)?], arg?: Parameters<T['Service'][TService][TMethod]>[0]): [Promise<FunctionReturnType<T['Service'][TService][TMethod]>>, () => void];
	public invoke<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: InvokeServiceOptions<T['Service'], TService, TMethod>, arg?: Parameters<T['Service'][TService][TMethod]>[0]): [Promise<FunctionReturnType<T['Service'][TService][TMethod]>>, () => void];
	public invoke<TMethod extends keyof T['Outgoing']>(
		options: InvokeMethodOptions<T['Outgoing'], TMethod>, arg?: Parameters<T['Outgoing'][TMethod]>[0]): [Promise<FunctionReturnType<T['Outgoing'][TMethod]>>, () => void];
	public invoke<TMethod extends keyof T['PrivateOutgoing']>(
		method: TMethod, arg: Parameters<T['PrivateOutgoing'][TMethod]>[0]): [Promise<FunctionReturnType<T['PrivateOutgoing'][TMethod]>>, () => void];
	public invoke<TMethod extends keyof T['PrivateOutgoing']>(
		options: InvokeMethodOptions<T['PrivateOutgoing'], TMethod>, arg?: Parameters<T['PrivateOutgoing'][TMethod]>[0]): [Promise<FunctionReturnType<T['PrivateOutgoing'][TMethod]>>, () => void];
	public invoke<
		TService extends keyof T['Service'],
		TServiceMethod extends keyof T['Service'][TService],
		TMethod extends keyof T['Outgoing'],
		TPrivateMethod extends keyof T['PrivateOutgoing']
	> (
		methodOptions: TMethod | TPrivateMethod | [TService, TServiceMethod, (number | false)?] | InvokeServiceOptions<T['Service'], TService, TServiceMethod> | InvokeMethodOptions<T['Outgoing'], TMethod> | InvokeMethodOptions<T['PrivateOutgoing'], TPrivateMethod>,
		arg?: (Parameters<T['Outgoing'][TMethod] | T['PrivateOutgoing'][TPrivateMethod] | T['Service'][TService][TServiceMethod]>)[0]
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
					promise: null
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

		const promise = request.promise = new Promise<FunctionReturnType<T['Service'][TService][TServiceMethod] | T['Outgoing'][TMethod] | T['PrivateOutgoing'][TPrivateMethod]>>((resolve, reject) => {
			if (request.ackTimeoutMs) {
				request.timeoutId = setTimeout(
					() => {
						delete callbackMap[request.cid];
						request.callback = null;
						clearTimeout(request.timeoutId);
						delete request.timeoutId;
						reject(new TimeoutError(`Method \'${[service, request.method].filter(Boolean).join('.')}\' timed out.`));
					},
					request.ackTimeoutMs
				);
			}

			abort = () => {
				delete callbackMap[request.cid];

				if (request.timeoutId) {
					clearTimeout(request.timeoutId);
					delete request.timeoutId;
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
					delete request.timeoutId;
				}

				if (err) {
					reject(err);
					return;
				}

				resolve(result);
			};

			request.sentCallback = () => {
				delete request.sentCallback;
				this._outboundSentMessageCount++;
			};
		});

		this._outboundPreparedMessageCount++;

		this.onInvoke(request as InvokeMethodRequest<T['Outgoing'], TMethod>);

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
			this._webSocket.onclose = null;
			this._webSocket.onerror = null;
			this._webSocket.onmessage = null;
			this._webSocket.onopen = null;

			delete this.onSocketClose;
			delete this.onSocketError;
			delete this.onSocketMessage;
			delete this.onOpen;
		}

		this._webSocket = value;

		if (value) {
			this._webSocket.onclose = this.onSocketClose = this.onSocketClose.bind(this);
			this._webSocket.onopen = this.onOpen = this.onOpen.bind(this);
			this._webSocket.onerror = this.onSocketError = this.onSocketError.bind(this);
			this._webSocket.onmessage = this.onSocketMessage = this.onSocketMessage.bind(this);
		}
	}	
}