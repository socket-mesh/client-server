import ws from "ws";
import { ServerProtocolError } from "@socket-mesh/errors";
import { CallIdGenerator } from "../socket.js";
import { ServerSocket } from "./server-socket.js";
import { ClientSocket } from "../client/client-socket.js";
import { IncomingMessage, Server as HttpServer } from 'http';
import defaultCodec, { CodecEngine } from "@socket-mesh/formatter";
import { HandlerMap } from "../client/maps/handler-map.js";
import { AnyPacket } from "../request.js";
import { AuthEngine, DefaultAuthEngine, isAuthEngine } from "./auth-engine.js";
import { handshakeHandler } from "./handlers/handshake.js";
import { ServerMiddleware } from "./middleware/server-middleware.js";
import { authenticateHandler } from "./handlers/authenticate.js";
import { removeAuthTokenHandler } from "../client/handlers/remove-auth-token.js";
import { CloseEvent, ConnectionEvent, ErrorEvent, HeadersEvent, ListeningEvent, ServerEvent, SocketAuthenticatedChangeEvent, SocketAuthenticationEvent, SocketBadAuthTokenEvent, SocketCloseEvent, SocketConnectEvent, SocketConnectingEvent, SocketDisconnectEvent, SocketErrorEvent, SocketMessageEvent, SocketPingEvent, SocketPongEvent, SocketRemoveAuthTokenEvent, SocketRequestEvent, SocketResponseEvent, SocketSubscribeEvent, SocketSubscribeFailEvent, SocketSubscribeStateChangeEvent, SocketUnexpectedResponseEvent, SocketUnsubscribeEvent, SocketUpgradeEvent } from "./server-event.js";
import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";
import { DemuxedConsumableStream, StreamEvent } from "@socket-mesh/stream-demux";
import { ServerOptions } from "./server-options.js";
import { ClientMapFromServer, ServerMap, SocketMapClientFromServer, SocketMapFromServer } from "../client/maps/socket-map.js";

interface ClientSocketDetails<T extends ServerMap> {
	type: 'client',
	socket: ClientSocket<ClientMapFromServer<T>>
}

interface ServerSocketDetails<T extends ServerMap> {
	type: 'server',
	socket: ServerSocket<T>,
	isAlive: boolean
}

export class Server<T extends ServerMap> extends AsyncStreamEmitter<ServerEvent<T>> {
	private readonly _callIdGenerator: CallIdGenerator;
	private readonly _clients: { [ id: string ]: ClientSocketDetails<T> | ServerSocketDetails<T> };
	private readonly _wss: ws.WebSocketServer;
	private _pingIntervalId: NodeJS.Timeout | null;
	private _isReady: boolean;
	private _isListening: boolean;
	private _handlers: HandlerMap<SocketMapFromServer<T>>;

	//| ServerSocket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>
	public ackTimeoutMs: number;
	public pingIntervalMs: number;
	public isPingTimeoutDisabled: boolean;
	public pingTimeoutMs: number;
	public readonly auth: AuthEngine;
	public readonly codecEngine: CodecEngine;
	public readonly httpServer: HttpServer;

	public readonly middleware: ServerMiddleware<T>[];

	constructor(options?: ServerOptions<T>) {
		super();

		let cid = 1;

		if (!options) {
			options = {};
		}

		options.clientTracking = true;

		this._clients = {};
		this.ackTimeoutMs = options.ackTimeoutMs || 10000;
		this.pingIntervalMs = options.pingIntervalMs || 8000;
		this.isPingTimeoutDisabled = (options.pingTimeoutMs === false);
		this.pingTimeoutMs = options.pingTimeoutMs || 20000;
		this._pingIntervalId = null;

		this._callIdGenerator = options.callIdGenerator || (() => {
			return cid++;
		});

		this.auth = isAuthEngine(options.authEngine) ? options.authEngine : new DefaultAuthEngine(options.authEngine);
		this.codecEngine = options.codecEngine || defaultCodec;
		this.middleware = options.middleware || [];
		this.httpServer = options.server;
		this._handlers = options.handlers || {};

		Object.assign(
			this._handlers,
			{
				"#authenticate": authenticateHandler,
				"#handshake": handshakeHandler,
				"#removeAuthToken": removeAuthTokenHandler
			}
		);

		this._wss = new ws.WebSocketServer(options);

		this._wss.on('close', this.onClose.bind(this));
		this._wss.on('connection', this.onConnection.bind(this));
		this._wss.on('error', this.onError.bind(this));
		this._wss.on('headers', this.onHeaders.bind(this));
		this._wss.on('listening', this.onListening.bind(this));

		setTimeout(() => {
			this._isReady = true;
			this.emit('ready', {});
		}, 0);
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
				for (let socketDetails of Object.values(this._clients)) {
					socketDetails.socket.disconnect();
				}

				// Stop the ping interval.
				clearInterval(this._pingIntervalId);
				this._pingIntervalId = null;
			}
		});
	}

	public get isListening(): boolean {
		return this._isListening;
	}

	public get isReady(): boolean {
		return this._isReady;
	}

	private onClose(): void {
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
			middleware: this.middleware,
			socket: wsSocket,
			state: { server: this },
			handlers: this._handlers,
			onUnhandledRequest: this.onUnhandledRequest.bind(this)
		});

		this.bind(socket);

		this._clients[socket.id] = {
			type: 'server',
			socket,
			isAlive: true
		}

//		ws.on('error', console.error);

		this.emit('connection', { socket, upgradeReq });

		//agSocket.exchange = this.exchange;
/*
		const inboundRawMiddleware = this._middleware[MiddlewareType.MIDDLEWARE_INBOUND_RAW];

		if (inboundRawMiddleware) {
			inboundRawMiddleware(socket.middlewareInboundRawStream);
		}

		const inboundMiddleware = this._middleware[MiddlewareType.MIDDLEWARE_INBOUND];

		if (inboundMiddleware) {
			inboundMiddleware(socket.middlewareInboundStream);
		}

		const outboundMiddleware = this._middleware[MiddlewareType.MIDDLEWARE_OUTBOUND];

		if (outboundMiddleware) {
			outboundMiddleware(socket.middlewareOutboundStream);
		}

		// Emit event to signal that a socket handshake has been initiated.
		this.emit('handshake', { socket: socket });
*/
	}

	private bind(
		socket: ClientSocket<ClientMapFromServer<T>> | ServerSocket<T>
	) {
		(async () => {
			for await (let event of socket.listen()) {
				this.emit(
					`socket${event.stream[0].toUpperCase()}${event.stream.substring(1)}` as any,
					event.value
				);
			}
		})();
	}

	private onError(error: Error | string): void {
		if (typeof error === 'string') {
			error = new ServerProtocolError(error);
		}

		//this.emitError(error);
	}
	
	private onHeaders(headers: string[], request: IncomingMessage): void {
		this.emit('headers', { headers, request });
	}
	
	private onListening(): void {
		this._isListening = true;

		this._pingIntervalId = setInterval(() => {
			let hasServerSockets = false;

			for (const id in this._clients) {
				const socket = this._clients[id];

				if ('isAlive' in socket) {
					if (socket.isAlive === false) {
						socket.socket.disconnect();
					} else {
						hasServerSockets = true;
						socket.isAlive = false;
						socket.socket.ping();
					}
				}

				// if the server is not open and we don't have any server sockets we need to stop the pinginging
				if (!hasServerSockets && !this.isListening) {
					clearInterval(this._pingIntervalId);
					this._pingIntervalId = null;
				}
			}
		}, this.pingIntervalMs);

		this.emit('listening', {});
	}

	private onUnhandledRequest(
		socket: ServerSocket<T> | ClientSocket<ClientMapFromServer<T>>,
		packet: AnyPacket<T['Service'], T['Incoming']>
	): void {

	}

	emit(event: "close", data: CloseEvent): void;
	emit(event: "connection", data: ConnectionEvent<T>): void;
	emit(event: "error", data: ErrorEvent): void;
	emit(event: "headers", data: HeadersEvent): void;
	emit(event: "listening", data: ListeningEvent): void;
	emit(event: "ready", data: {}): void;
	emit(event: 'socketAuthStateChange', data: SocketAuthenticatedChangeEvent<T>): void;
	emit(event: 'socketAuthenticate', data: SocketAuthenticationEvent<T>): void;
	emit(event: 'socketBadAuthToken', data: SocketBadAuthTokenEvent<T>): void;
	emit(event: 'socketClose', data: SocketCloseEvent<T>): void;
	emit(event: 'socketConnect', data: SocketConnectEvent<T>): void;
	emit(event: 'socketConnectAbort', data: SocketDisconnectEvent<T>): void;
	emit(event: 'socketConnecting', data: SocketConnectingEvent<T>): void;
	emit(event: 'socketDeauthenticate', data: SocketAuthenticationEvent<T>): void;
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
	emit(event: string, data: any): void {
		super.emit(event, data);
	}

	listen(): DemuxedConsumableStream<StreamEvent<ServerEvent<T>>>;
	listen(event: "close"): DemuxedConsumableStream<CloseEvent>;
	listen(event: "connection"): DemuxedConsumableStream<ConnectionEvent<T>>;
	listen(event: "error"): DemuxedConsumableStream<ErrorEvent>;
	listen(event: "headers"): DemuxedConsumableStream<HeadersEvent>;
	listen(event: "listening"): DemuxedConsumableStream<ListeningEvent>;
	listen(event: "ready"): DemuxedConsumableStream<{}>;
	listen(event: 'socketAuthStateChange'): DemuxedConsumableStream<SocketAuthenticatedChangeEvent<T>>;
	listen(event: 'socketAuthenticate'): DemuxedConsumableStream<SocketAuthenticationEvent<T>>;
	listen(event: 'socketBadAuthToken'): DemuxedConsumableStream<SocketBadAuthTokenEvent<T>>;
	listen(event: 'socketClose'): DemuxedConsumableStream<SocketCloseEvent<T>>;
	listen(event: 'socketConnect'): DemuxedConsumableStream<SocketConnectEvent<T>>;
	listen(event: 'socketConnectAbort'): DemuxedConsumableStream<SocketDisconnectEvent<T>>;
	listen(event: 'socketConnecting'): DemuxedConsumableStream<SocketConnectingEvent<T>>;
	listen(event: 'socketDeauthenticate'): DemuxedConsumableStream<SocketAuthenticationEvent<T>>;
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
	listen(eventName?: string): DemuxedConsumableStream<StreamEvent<any>> | DemuxedConsumableStream<ServerEvent<T>> {
		return super.listen(eventName);
	}





/*
	listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
	listen(port?: number, hostname?: string, listeningListener?: () => void): this;
	listen(port?: number, backlog?: number, listeningListener?: () => void): this;
	listen(port?: number, listeningListener?: () => void): this;
	listen(path: string, backlog?: number, listeningListener?: () => void): this;
	listen(path: string, listeningListener?: () => void): this;
	listen(options: net.ListenOptions, listeningListener?: () => void): this;
	listen(handle: any, backlog?: number, listeningListener?: () => void): this;
	listen(handle: any, listeningListener?: () => void): this;
	listen(): this {
		this.server.listen.apply(this.server, arguments);

		return this;
	}

	on(event: 'close', listener: () => void): this;
	on(event: 'connection', listener: ConnectionListener): this;
	on(event: 'error', listener: (err: Error) => void): this;	
	on(event: 'listening', listener: () => void): this;
	on(event: 'drop', listener: (data?: net.DropArgument) => void): this;
	on(event: string, listener: (...args: any[]) => void): this;
	on(event: string, listener: (...args: any[]) => void): this {
		if (event === 'connection' || event === 'error') {
			super.on.call(this, event, listener);
		} else {
			this.server.on(event, listener);
		}

		return this;
	}

	removeListener(event: 'connection', listener: ConnectionListener): this;	
	removeListener(event: 'error', listener: (err: Error) => void): this;
	removeListener(eventName: string | symbol, listener: (...args: any[]) => void): this
	removeListener(): this {
		super.removeListener.apply(this, arguments);
		this.server.removeListener.apply(this.server, arguments);

		return this;
	}

	removeAllListeners(event?: string | symbol): this {
		super.removeAllListeners.apply(this, arguments);
		this.removeAllListeners.apply(this.server, arguments);

		return this;
	}

	close(callback?: (err?: Error) => void): this {
		this.server.close(callback);

		return this;
	}
*/
}
