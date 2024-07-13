import ws from "ws";
import { ServerProtocolError } from "@socket-mesh/errors";
import { ServerSocket } from "./server-socket.js";
import { IncomingMessage, Server as HttpServer, OutgoingHttpHeaders } from 'http';
import defaultCodec, { CodecEngine } from "@socket-mesh/formatter";
import { ClientSocket, HandlerMap, removeAuthTokenHandler } from "@socket-mesh/client";
import { AnyPacket, CallIdGenerator, StreamCleanupMode } from "@socket-mesh/client/core";
import { AuthEngine, defaultAuthEngine, isAuthEngine } from "@socket-mesh/auth-engine";
import { handshakeHandler } from "./handlers/handshake.js";
import { ServerMiddleware } from "./middleware/server-middleware.js";
import { authenticateHandler } from "./handlers/authenticate.js";
import { CloseEvent, ConnectionEvent, ErrorEvent, HandshakeEvent, HeadersEvent, ListeningEvent, ServerEvent, ServerSocketEvent, SocketAuthenticateEvent, SocketAuthStateChangeEvent, SocketBadAuthTokenEvent, SocketCloseEvent, SocketConnectEvent, SocketConnectingEvent, SocketDeauthenticateEvent, SocketDisconnectEvent, SocketErrorEvent, SocketMessageEvent, SocketPingEvent, SocketPongEvent, SocketRemoveAuthTokenEvent, SocketRequestEvent, SocketResponseEvent, SocketSubscribeEvent, SocketSubscribeFailEvent, SocketSubscribeStateChangeEvent, SocketUnexpectedResponseEvent, SocketUnsubscribeEvent, SocketUpgradeEvent, WarningEvent } from "./server-event.js";
import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";
import { DemuxedConsumableStream, StreamEvent } from "@socket-mesh/stream-demux";
import { ServerOptions } from "./server-options.js";
import { SocketMapFromServer } from "./maps/socket-map.js";
import { ServerMap } from "./maps/server-map.js";
import { ClientMapFromServer } from "./maps/client-map.js";
import { subscribeHandler } from "./handlers/subscribe.js";
import { unsubscribeHandler } from "./handlers/unsubscribe.js";
import { Broker } from "./broker/broker.js";
import { SimpleBroker } from "./broker/simple-broker.js";
import { Exchange } from "./broker/exchange.js";
import { publishHandler } from "./handlers/publish.js";

export class Server<T extends ServerMap> extends AsyncStreamEmitter<ServerEvent<T>> {
	private readonly _callIdGenerator: CallIdGenerator;
	private readonly _wss: ws.WebSocketServer;
	private _isReady: boolean;
	private _isListening: boolean;
	private _pingIntervalRef: NodeJS.Timeout;	
	private _handlers: HandlerMap<SocketMapFromServer<T>>;

	//| ServerSocket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>
	public ackTimeoutMs: number;
	public allowClientPublish: boolean;
	public pingIntervalMs: number;
	public isPingTimeoutDisabled: boolean;
	public origins: string;
	public pingTimeoutMs: number;
	public socketChannelLimit?: number;
	public strictHandshake: boolean;

	public readonly auth: AuthEngine;
	public readonly brokerEngine: Broker<T['Channel']>;
	public readonly clients: { [ id: string ]: ClientSocket<ClientMapFromServer<T>> | ServerSocket<T> };
	public clientCount: number;
	public readonly codecEngine: CodecEngine;
	public readonly pendingClients: { [ id: string ]: ClientSocket<ClientMapFromServer<T>> | ServerSocket<T> };	
	public pendingClientCount: number;
	public readonly socketStreamCleanupMode: StreamCleanupMode;
	public readonly httpServer: HttpServer;

	public readonly middleware: ServerMiddleware<T>[];

	constructor(options?: ServerOptions<T>) {
		super();

		let cid = 1;

		if (!options) {
			options = {};
		}

		options.clientTracking = true;

		this.ackTimeoutMs = options.ackTimeoutMs || 10000;
		this.allowClientPublish = options.allowClientPublish ?? true;
		this.auth = isAuthEngine(options.authEngine) ? options.authEngine : defaultAuthEngine(options.authEngine);
		this.brokerEngine = options.brokerEngine || new SimpleBroker<T['Channel']>();
		this._callIdGenerator = options.callIdGenerator || (() => {
			return cid++;
		});
		
		this.clients = {};
		this.clientCount = 0;
		this.codecEngine = options.codecEngine || defaultCodec;

		this._handlers = Object.assign(
			{
				"#authenticate": authenticateHandler,
				"#handshake": handshakeHandler,
				"#publish": publishHandler,
				"#removeAuthToken": removeAuthTokenHandler,
				"#subscribe": subscribeHandler,
				"#unsubscribe": unsubscribeHandler
			},
			options.handlers
		);
		this.httpServer = options.server;

		this.middleware = options.middleware || [];
		this.origins = options.origins || '*:*';
		this.pendingClients = {};
		this.pendingClientCount = 0;
		this.isPingTimeoutDisabled = (options.isPingTimeoutDisabled === true);
		this.pingIntervalMs = options.pingIntervalMs || 8000;
		this.pingTimeoutMs = options.pingTimeoutMs || 20000;

		this.socketChannelLimit = options.socketChannelLimit;
		this.socketStreamCleanupMode = options.socketStreamCleanupMode || 'kill';
		this.strictHandshake = options.strictHandshake ?? true;

		options.verifyClient = this.verifyClient.bind(this);

		this._wss = new ws.WebSocketServer(options);

		this._wss.on('close', this.onClose.bind(this));
		this._wss.on('connection', this.onConnection.bind(this));
		this._wss.on('error', this.onError.bind(this));
		this._wss.on('headers', this.onHeaders.bind(this));
		this._wss.on('listening', this.onListening.bind(this));

		(async () => {
			for await (let { error } of this.brokerEngine.listen('error')) {
				this.emit('warning', { warning: error });
			}
		})();

		if (this.brokerEngine.isReady) {
			setTimeout(() => {
				this._isReady = true;
				this.emit('ready', {});
			}, 0);	
		} else {
			this._isReady = false;
			(async () => {
				await this.brokerEngine.listen('ready').once();
				this._isReady = true;
				this.emit('ready', {});
			})();
		}
	}

	public addMiddleware(...middleware: ServerMiddleware<T>[]): void {
		this.middleware.push(...middleware);
	}

	private bind(socket: ClientSocket<ClientMapFromServer<T>> | ServerSocket<T>) {
		if (socket.type === 'client') {
			(async () => {
				for await (let event of socket.listen()) {
					this.emit(
						`socket${event.stream[0].toUpperCase()}${event.stream.substring(1)}` as any,
						Object.assign(
							{ socket },
							event.value
						)
					);
				}
			})();
	
			(async () => {
				for await (let event of socket.channels.listen()) {
					this.emit(
						`socket${event.stream[0].toUpperCase()}${event.stream.substring(1)}` as any,
						Object.assign(
							{ socket },
							event.value
						)
					);
				}
			})();	
		}

		(async () => {
			for await (let {} of socket.listen('connect')) {
				if (this.pendingClients[socket.id]) {
					delete this.pendingClients[socket.id];
					this.pendingClientCount--;
				}
			
				this.clients[socket.id] = socket;
				this.clientCount++;
				this.startPinging();
			}
		})();

		(async () => {
			for await (let {} of socket.listen('connectAbort')) {
				this.socketDisconnected(socket);
			}
		})();

		(async () => {
			for await (let {} of socket.listen('disconnect')) {
				this.socketDisconnected(socket);
			}
		})();
	}

	close(keepSocketsOpen?: boolean): Promise<void> {
		this._isListening = false;

		return new Promise<void>((resolve, reject) => {
			this._wss.close((err) => {
				if (err) {
					reject(err);
					return;
				}
				resolve();
			});

			if (!keepSocketsOpen) {
				for (let socket of Object.values(this.clients)) {
					socket.disconnect();
				}
			}
		});
	}

	public get exchange(): Exchange<T['Channel']> {
		return this.brokerEngine.exchange;
	}

	public get isListening(): boolean {
		return this._isListening;
	}

	public get isReady(): boolean {
		return this._isReady;
	}

	private onClose(code: string, reason: Buffer): void {
		this.emit('close', {});
	}

	private onConnection(wsSocket: ws.WebSocket, upgradeReq: IncomingMessage): void {
/*
		if (!wsSocket.upgradeReq) {
			// Normalize ws modules to match.
			wsSocket.upgradeReq = upgradeReq;
		}
*/
		const socket = new ServerSocket<T>({
			ackTimeoutMs: this.ackTimeoutMs,
			callIdGenerator: this._callIdGenerator,
			codecEngine: this.codecEngine,
			handlers: this._handlers,
			middleware: this.middleware,
			onUnhandledRequest: this.onUnhandledRequest.bind(this),
			request: upgradeReq,
			socket: wsSocket,
			server: this,
			state: {},
			streamCleanupMode: this.socketStreamCleanupMode
		});

		this.pendingClientCount++;
		this.bind(this.pendingClients[socket.id] = socket);

//		ws.on('error', console.error);

		this.emit('connection', { socket, upgradeReq });

		// Emit event to signal that a socket handshake has been initiated.
		this.emit('handshake', { socket });
	}

	private onError(error: Error | string): void {
		if (typeof error === 'string') {
			error = new ServerProtocolError(error);
		}

		this.emit('error', { error });
	}
	
	private onHeaders(headers: string[], request: IncomingMessage): void {
		this.emit('headers', { headers, request });
	}
	
	private onListening(): void {
		this._isListening = true;

		this.emit('listening', {});
	}

	private onUnhandledRequest(
		socket: ServerSocket<T> | ClientSocket<ClientMapFromServer<T>>,
		packet: AnyPacket<SocketMapFromServer<T>>
	): void {

	}

	private socketDisconnected(socket: ClientSocket<ClientMapFromServer<T>> | ServerSocket<T>): void {
		if (!!this.pendingClients[socket.id]) {
			delete this.pendingClients[socket.id];
			this.pendingClientCount--;
		}

		if (!!this.clients[socket.id]) {
			delete this.clients[socket.id];
			this.clientCount--;
		}

		if (this.clientCount <= 0) {
			this.stopPinging();
		}
	}

	private startPinging(): void {
		if (!this._pingIntervalRef && !this.isPingTimeoutDisabled) {
			this._pingIntervalRef = setInterval(() => {
				for (const id in this.clients) {
					this.clients[id]
						.ping()
						.catch(err => {
							this.onError(err);
						});
				}
			}, this.pingIntervalMs);
		}
	}

	private stopPinging(): void {
		if (this._pingIntervalRef) {
			clearInterval(this._pingIntervalRef);
			this._pingIntervalRef = null;
		}
	}

	private async verifyClient(
		info: { origin: string; secure: boolean; req: IncomingMessage },
		callback: (res: boolean, code?: number, message?: string, headers?: OutgoingHttpHeaders) => void
	): Promise<void> {
		try {
			if (typeof info.origin !== 'string' || info.origin === 'null') {
				info.origin = '*';
			}

			if (this.origins.indexOf('*:*') === -1) {
				let ok = false;

				try {
					const url = new URL(info.origin);
					url.port = url.port || (url.protocol === 'https:' ? '443' : '80');
					ok = !!(~this.origins.indexOf(url.hostname + ':' + url.port) ||
						~this.origins.indexOf(url.hostname + ':*') ||
						~this.origins.indexOf('*:' + url.port));
				} catch (e) {}

				if (!ok) {
					const error = new ServerProtocolError(
						`Failed to authorize socket handshake - Invalid origin: ${info.origin}`
					);
			
					this.emit('warning', { warning: error });
			
					callback(false, 403, error.message);
					return;	
				}
			}

			try {
				for (const middleware of this.middleware) {
					if (middleware.onConnection) {
						await middleware.onConnection(info.req);
					}
				}
			} catch (err) {
				callback(false, 401, typeof err === 'string' ? err : err.message);
				return;
			}

			callback(true);
		} catch (err) {
			this.onError(err);
			this.emit('warning', { warning: err });

			callback(false, 403, typeof err === 'string' ? err : err.message);
		}
	}

	emit(event: "close", data: CloseEvent): void;
	emit(event: "connection", data: ConnectionEvent<T>): void;
	emit(event: "error", data: ErrorEvent): void;
	emit(event: "headers", data: HeadersEvent): void;
	emit(event: "handshake", data: HandshakeEvent<T>): void;
	emit(event: "listening", data: ListeningEvent): void;
	emit(event: "ready", data: {}): void;
	emit(event: 'socketAuthStateChange', data: SocketAuthStateChangeEvent<T>): void;
	emit(event: 'socketAuthenticate', data: SocketAuthenticateEvent<T>): void;
	emit(event: 'socketBadAuthToken', data: SocketBadAuthTokenEvent<T>): void;
	emit(event: 'socketClose', data: SocketCloseEvent<T>): void;
	emit(event: 'socketConnect', data: SocketConnectEvent<T>): void;
	emit(event: 'socketConnectAbort', data: SocketDisconnectEvent<T>): void;
	emit(event: 'socketConnecting', data: SocketConnectingEvent<T>): void;
	emit(event: 'socketDeauthenticate', data: SocketDeauthenticateEvent<T>): void;
	emit(event: 'socketDisconnect', data: SocketDisconnectEvent<T>): void;
	emit(event: 'socketError', data: SocketErrorEvent<T>): void;
	emit(event: 'socketMessage', data: SocketMessageEvent<T>): void;
	emit(event: 'socketPing', data: SocketPingEvent<T>): void;
	emit(event: 'socketPong', data: SocketPongEvent<T>): void;
	emit(event: 'socketRemoveAuthToken', data: SocketRemoveAuthTokenEvent<T>): void;
	emit(event: 'socketRequest', data: SocketRequestEvent<T>): void;
	emit(event: 'socketResponse', data: SocketResponseEvent<T>): void;
	emit(event: 'socketSubscribe', data: SocketSubscribeEvent<T>): void;
	emit(event: 'socketSubscribeFail', data: SocketSubscribeFailEvent<T>): void;
	emit(event: 'socketSubscribeRequest', data: SocketSubscribeEvent<T>): void;
	emit(event: 'socketSubscribeStateChange', data: SocketSubscribeStateChangeEvent<T>): void;
	emit(event: 'socketUnsubscribe', data: SocketUnsubscribeEvent<T>): void;
	emit(event: 'socketUnexpectedResponse', data: SocketUnexpectedResponseEvent<T>): void;
	emit(event: 'socketUpgrade', data: SocketUpgradeEvent<T>): void;
	emit(event: "warning", data: WarningEvent): void;
	emit(event: string, data: any): void {
		super.emit(event, data);
	}

	listen(): DemuxedConsumableStream<StreamEvent<ServerEvent<T>>>;
	listen(event: "close"): DemuxedConsumableStream<CloseEvent>;
	listen(event: "connection"): DemuxedConsumableStream<ConnectionEvent<T>>;
	listen(event: "error"): DemuxedConsumableStream<ErrorEvent>;
	listen(event: "handshake"): DemuxedConsumableStream<HandshakeEvent<T>>;
	listen(event: "headers"): DemuxedConsumableStream<HeadersEvent>;
	listen(event: "listening"): DemuxedConsumableStream<ListeningEvent>;
	listen(event: "ready"): DemuxedConsumableStream<{}>;
	listen(event: 'socketAuthStateChange'): DemuxedConsumableStream<SocketAuthStateChangeEvent<T>>;
	listen(event: 'socketAuthenticate'): DemuxedConsumableStream<SocketAuthenticateEvent<T>>;
	listen(event: 'socketBadAuthToken'): DemuxedConsumableStream<SocketBadAuthTokenEvent<T>>;
	listen(event: 'socketClose'): DemuxedConsumableStream<SocketCloseEvent<T>>;
	listen(event: 'socketConnect'): DemuxedConsumableStream<SocketConnectEvent<T>>;
	listen(event: 'socketConnectAbort'): DemuxedConsumableStream<SocketDisconnectEvent<T>>;
	listen(event: 'socketConnecting'): DemuxedConsumableStream<SocketConnectingEvent<T>>;
	listen(event: 'socketDeauthenticate'): DemuxedConsumableStream<SocketDeauthenticateEvent<T>>;
	listen(event: 'socketDisconnect'): DemuxedConsumableStream<SocketDisconnectEvent<T>>;
	listen(event: 'socketError'): DemuxedConsumableStream<SocketErrorEvent<T>>;
	listen(event: 'socketMessage'): DemuxedConsumableStream<SocketMessageEvent<T>>;
	listen(event: 'socketPing'): DemuxedConsumableStream<SocketPingEvent<T>>;
	listen(event: 'socketPong'): DemuxedConsumableStream<SocketPongEvent<T>>;
	listen(event: 'socketRemoveAuthToken'): DemuxedConsumableStream<SocketRemoveAuthTokenEvent<T>>;
	listen(event: 'socketRequest'): DemuxedConsumableStream<SocketRequestEvent<T>>;
	listen(event: 'socketResponse'): DemuxedConsumableStream<SocketResponseEvent<T>>;
	listen(event: 'socketSubscribe'): DemuxedConsumableStream<SocketSubscribeEvent<T>>;
	listen(event: 'socketSubscribeFail'): DemuxedConsumableStream<SocketSubscribeFailEvent<T>>;
	listen(event: 'socketSubscribeRequest'): DemuxedConsumableStream<SocketSubscribeEvent<T>>;
	listen(event: 'socketSubscribeStateChange'): DemuxedConsumableStream<SocketSubscribeStateChangeEvent<T>>;
	listen(event: 'socketUnsubscribe'): DemuxedConsumableStream<SocketUnsubscribeEvent<T>>;
	listen(event: 'socketUnexpectedResponse'): DemuxedConsumableStream<SocketUnexpectedResponseEvent<T>>;
	listen(event: 'socketUpgrade'): DemuxedConsumableStream<SocketUpgradeEvent<T>>;
	listen(event: "warning"): DemuxedConsumableStream<WarningEvent>;
	listen(event?: string): DemuxedConsumableStream<StreamEvent<any>> | DemuxedConsumableStream<ServerEvent<T>> {
		return super.listen(event);
	}
}
