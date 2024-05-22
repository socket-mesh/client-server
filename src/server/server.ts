import ws from "ws";
import { ServerProtocolError } from "@socket-mesh/errors";
import { CallIdGenerator, Socket } from "../socket.js";
import { ServerSocket } from "./server-socket.js";
import { ClientSocket } from "../client/client-socket.js";
import { IncomingMessage, Server as HttpServer } from 'http';
import defaultCodec, { CodecEngine } from "@socket-mesh/formatter";
import { MethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map.js";
import { HandlerMap } from "../client/maps/handler-map.js";
import { AnyPacket } from "../request.js";
import { AuthEngine, DefaultAuthEngine, isAuthEngine } from "./auth-engine.js";
import { ServerPrivateMap } from "../client/maps/server-private-map.js";
import { handshakeHandler } from "./handlers/handshake.js";
import { ServerSocketState } from "./server-socket-state.js";
import { ServerMiddleware } from "./middleware/server-middleware.js";
import { authenticateHandler } from "./handlers/authenticate.js";
import { removeAuthTokenHandler } from "../client/handlers/remove-auth-token.js";
import { ClientPrivateMap } from "../client/maps/client-private-map.js";
import { CloseEvent, ConnectionEvent, ErrorEvent, HeadersEvent, ListeningEvent, ServerEvent, SocketAuthenticatedChangeEvent, SocketAuthenticationEvent, SocketBadAuthTokenEvent, SocketCloseEvent, SocketConnectEvent, SocketConnectingEvent, SocketDisconnectEvent, SocketErrorEvent, SocketMessageEvent, SocketPingEvent, SocketPongEvent, SocketRemoveAuthTokenEvent, SocketRequestEvent, SocketResponseEvent, SocketSubscribeEvent, SocketSubscribeFailEvent, SocketSubscribeStateChangeEvent, SocketUnexpectedResponseEvent, SocketUnsubscribeEvent, SocketUpgradeEvent } from "./server-event.js";
import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";
import { DemuxedConsumableStream, StreamEvent } from "@socket-mesh/stream-demux";
import { ServerOptions } from "./server-options.js";
import { ChannelMap } from "../client/channels/channel-map.js";

interface SocketDetails<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object,
	TSocket extends Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>
> {
	socket: TSocket
}

interface ClientSocketDetails<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TChannelMap extends ChannelMap<TChannelMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ServerPrivateMap,
	TSocketState extends object,
> extends SocketDetails<TIncomingMap & ClientPrivateMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState, ClientSocket<TOutgoingMap, TChannelMap, TServiceMap, TSocketState, TIncomingMap, TPrivateOutgoingMap>> {
	type: 'client',
}

interface ServerSocketDetails<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap>,
	TChannelMap extends ChannelMap<TChannelMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap> & ServerPrivateMap,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TServerState extends object,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> extends SocketDetails<TIncomingMap & TPrivateIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState, ServerSocket<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>> {
	type: 'server',
	isAlive: boolean
}

export class Server<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap & ServerPrivateMap>,
	TServerState extends object,
	TChannelMap extends ChannelMap<TChannelMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap> & ServerPrivateMap,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap,
	TSocketState extends ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState> = ServerSocketState<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState>
> extends AsyncStreamEmitter<ServerEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>> {
	private readonly _callIdGenerator: CallIdGenerator;
	private readonly _clients: { [ id: string ]: ClientSocketDetails<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TSocketState> | ServerSocketDetails<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState> };
	private readonly _wss: ws.WebSocketServer;
	private _pingIntervalId: NodeJS.Timeout | null;
	private _isReady: boolean;
	private _isListening: boolean;
	private _handlers:
		HandlerMap<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TSocketState> |
		HandlerMap<TIncomingMap & TPrivateIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;

	//| ServerSocket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>
	public ackTimeoutMs: number;
	public pingIntervalMs: number;
	public isPingTimeoutDisabled: boolean;
	public pingTimeoutMs: number;
	public readonly auth: AuthEngine;
	public readonly codecEngine: CodecEngine;
	public readonly httpServer: HttpServer;

	public readonly middleware: ServerMiddleware<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>[];

	constructor(options?: ServerOptions<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TSocketState>) {
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
		const socket = new ServerSocket({
			ackTimeoutMs: this.ackTimeoutMs,
			callIdGenerator: this._callIdGenerator,
			codecEngine: this.codecEngine,
			middleware: this.middleware,
			socket: wsSocket,
			state: {
				server: this
			} as any,
			handlers: this._handlers as HandlerMap<TIncomingMap & TPrivateIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>,
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
		socket: ClientSocket<TOutgoingMap, TChannelMap, TServiceMap, TSocketState, TIncomingMap, TPrivateIncomingMap> | ServerSocket<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState>
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
		socket: ServerSocket<TIncomingMap, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TSocketState> | ClientSocket<TOutgoingMap, TChannelMap, TServiceMap, TSocketState, TIncomingMap, TPrivateIncomingMap>,
		packet: AnyPacket<TServiceMap, TIncomingMap>
	): void {

	}

	emit(event: "close", data: CloseEvent): void;
	emit(event: "connection", data: ConnectionEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: "error", data: ErrorEvent): void;
	emit(event: "headers", data: HeadersEvent): void;
	emit(event: "listening", data: ListeningEvent): void;
	emit(event: "ready", data: {}): void;
	emit(event: 'socketAuthStateChange', data: SocketAuthenticatedChangeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketAuthenticate', data: SocketAuthenticationEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketBadAuthToken', data: SocketBadAuthTokenEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketClose', data: SocketCloseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketConnect', data: SocketConnectEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketConnectAbort', data: SocketDisconnectEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketConnecting', data: SocketConnectingEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketDeauthenticate', data: SocketAuthenticationEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketDisconnect', data: SocketDisconnectEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketError', data: SocketErrorEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketMessage', data: SocketMessageEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketPing', data: SocketPingEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketPong', data: SocketPongEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketRemoveAuthToken', data: SocketRemoveAuthTokenEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketRequest', data: SocketRequestEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketResponse', data: SocketResponseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketSubscribe', data: SocketSubscribeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketSubscribeFail', data: SocketSubscribeFailEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketSubscribeRequest', data: SocketSubscribeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketSubscribeStateChange', data: SocketSubscribeStateChangeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketUnsubscribe', data: SocketUnsubscribeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketUnexpectedResponse', data: SocketUnexpectedResponseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: 'socketUpgrade', data: SocketUpgradeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>): void;
	emit(event: string, data: any): void {
		super.emit(event, data);
	}

	listen(): DemuxedConsumableStream<StreamEvent<ServerEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>>;
	listen(event: "close"): DemuxedConsumableStream<CloseEvent>;
	listen(event: "connection"): DemuxedConsumableStream<ConnectionEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: "error"): DemuxedConsumableStream<ErrorEvent>;
	listen(event: "headers"): DemuxedConsumableStream<HeadersEvent>;
	listen(event: "listening"): DemuxedConsumableStream<ListeningEvent>;
	listen(event: "ready"): DemuxedConsumableStream<{}>;
	listen(event: 'socketAuthStateChange'): DemuxedConsumableStream<SocketAuthenticatedChangeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketAuthenticate'): DemuxedConsumableStream<SocketAuthenticationEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketBadAuthToken'): DemuxedConsumableStream<SocketBadAuthTokenEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketClose'): DemuxedConsumableStream<SocketCloseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketConnect'): DemuxedConsumableStream<SocketConnectEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketConnectAbort'): DemuxedConsumableStream<SocketDisconnectEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketConnecting'): DemuxedConsumableStream<SocketConnectingEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketDeauthenticate'): DemuxedConsumableStream<SocketAuthenticationEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketDisconnect'): DemuxedConsumableStream<SocketDisconnectEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketError'): DemuxedConsumableStream<SocketErrorEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketMessage'): DemuxedConsumableStream<SocketMessageEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketPing'): DemuxedConsumableStream<SocketPingEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketPong'): DemuxedConsumableStream<SocketPongEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketRemoveAuthToken'): DemuxedConsumableStream<SocketRemoveAuthTokenEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketRequest'): DemuxedConsumableStream<SocketRequestEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketResponse'): DemuxedConsumableStream<SocketResponseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketSubscribe'): DemuxedConsumableStream<SocketSubscribeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketSubscribeFail'): DemuxedConsumableStream<SocketSubscribeFailEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketSubscribeRequest'): DemuxedConsumableStream<SocketSubscribeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketSubscribeStateChange'): DemuxedConsumableStream<SocketSubscribeStateChangeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketUnsubscribe'): DemuxedConsumableStream<SocketUnsubscribeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketUnexpectedResponse'): DemuxedConsumableStream<SocketUnexpectedResponseEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(event: 'socketUpgrade'): DemuxedConsumableStream<SocketUpgradeEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>>;
	listen(eventName?: string): DemuxedConsumableStream<StreamEvent<any>> | DemuxedConsumableStream<ServerEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, TServerState, TChannelMap, TSocketState>> {
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
