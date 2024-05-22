import { SocketStatus } from "../socket.js";
import ws from "isomorphic-ws";
import { ClientAuthEngine, LocalStorageAuthEngine, isAuthEngine } from "./client-auth-engine.js";
import { FunctionReturnType, MethodMap, PublicMethodMap, ServiceMap } from "./maps/method-map.js";
import { hydrateError } from "@socket-mesh/errors";
import { ServerPrivateMap, HandshakeStatus } from "./maps/server-private-map.js";
import { InvokeMethodOptions, InvokeServiceOptions, SocketTransport } from "../socket-transport.js";
import { AutoReconnectOptions, ClientSocketOptions, ConnectOptions } from "./client-socket-options.js";
import { AuthToken } from "@socket-mesh/auth";
import { AbortablePromise } from "../utils.js";

/*
export interface ClientSocketWsOptions extends BaseClientSocketOptions {
	socket: ws.WebSocket
}

export type ClientSocketOptions = ClientSocketAddressOptions | ClientSocketWsOptions;

function createSocket(options: ClientSocketOptions | string | URL): ws.WebSocket {
	if (typeof options === 'string') {
		return new ws.WebSocket(options);
	}

	if ('pathname' in options) {
		return new ws.WebSocket(options);	
	}

	if ('address' in options) {
		return new ws.WebSocket(options.address, options.protocols, options.wsOptions);
	}

	return options.socket;
}
*/

export class ClientTransport<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object
> extends SocketTransport<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap & ServerPrivateMap, TSocketState> {
	public readonly authEngine: ClientAuthEngine;

	private _uri: URL;
	private _wsOptions: ws.ClientOptions;

	public connectTimeoutMs: number;
	private _connectTimeoutRef: NodeJS.Timeout;

	private _pingTimeoutRef: NodeJS.Timeout;
	private _pingTimeoutMs: number;
	public isPingTimeoutDisabled: boolean;

	private _connectAttempts: number;
	private _pendingReconnectTimeout: number | null;
	private _autoReconnect: AutoReconnectOptions | false;

	constructor(options: ClientSocketOptions<TOutgoingMap, TServiceMap, TSocketState, TIncomingMap, TPrivateOutgoingMap>) {
		super(options);

		this._uri = typeof options.address === 'string' ? new URL(options.address) : options.address;
		this.authEngine =
			isAuthEngine(options.authEngine) ?
			options.authEngine :
			new LocalStorageAuthEngine(
				Object.assign(
					{ authTokenName: `socketmesh.authToken${this._uri.protocol}${this._uri.hostname}` },
					options.authEngine
				)
			);

		this.isPingTimeoutDisabled = (options.isPingTimeoutDisabled === false);
		this.connectTimeoutMs = options.connectTimeoutMs ?? 20000;
		this._pingTimeoutMs = this.connectTimeoutMs;

		if (options.wsOptions) {
			this._wsOptions = options.wsOptions;
		}

		this._connectAttempts = 0;
		this._pendingReconnectTimeout = null;
		this.autoReconnect = options.autoReconnect;
	}

	protected override onOpen() {
		clearTimeout(this._connectTimeoutRef);		
		this.resetReconnect();
		this.resetPingTimeout();

		this.handshake()
			.then(status => {
				this.id = status.id;
				this._pingTimeoutMs = status.pingTimeoutMs;
				this.resetPingTimeout();

				if ('authToken' in status && status.authToken) {
					return this.setAuthorization(status.authToken);
				}

				return this.deauthenticate();
			})
			.then(() => {
				this.setOpenStatus();
				super.onOpen();
			})
			.catch(err => {
				if (err.statusCode == null) {
					err.statusCode = 4003;
				}
				this.onError(err);
				this.disconnect(err.statusCode, err.toString());
			});
	}

	protected override onClose(code: number, reason?: Buffer) {
		super.onClose(code, reason);

		clearTimeout(this._pingTimeoutRef);

		// Try to reconnect
		// on server ping timeout (4000)
		// or on client pong timeout (4001)
		// or on close without status (1005)
		// or on handshake failure (4003)
		// or on handshake rejection (4008)
		// or on socket hung up (1006)
		if (this.autoReconnect) {
			if (code === 4000 || code === 4001 || code === 1005) {
				// If there is a ping or pong timeout or socket closes without
				// status, don't wait before trying to reconnect - These could happen
				// if the client wakes up after a period of inactivity and in this case we
				// want to re-establish the connection as soon as possible.
				this.tryReconnect(0);

				// Codes 4500 and above will be treated as permanent disconnects.
				// Socket will not try to auto-reconnect.
			} else if (code !== 1000 && code < 4500) {
				this.tryReconnect();
			}
		}		
	}

	public override get status(): SocketStatus {
		if (this.pendingReconnect) {
			return 'connecting';
		}

		return super.status;
	}

	public get uri(): URL {
		return this._uri
	}

	public get pendingReconnect(): boolean {
		return (this._pendingReconnectTimeout !== null);
	}

	public get autoReconnect(): AutoReconnectOptions | false {
		return this._autoReconnect;
	}
	
	public set autoReconnect(value: Partial<AutoReconnectOptions> | boolean) {
		if (value) {
			this._autoReconnect = Object.assign<AutoReconnectOptions, Partial<AutoReconnectOptions>>(
				{
					initialDelay: 10000,
					randomness: 10000,
					multiplier: 1.5,
					maxDelayMs: 60000
				},
				value === true ? {} : value
			);
		} else {
			this._autoReconnect = false;
		}
	}

	public get connectAttempts(): number {
		return this._connectAttempts;
	}

	protected get webSocket() {
		return super.webSocket;
	}

	protected set webSocket(value: ws.WebSocket | null) {
		if (this.webSocket) {
			this.webSocket.off('ping', this.resetPingTimeout);

			if (this._connectTimeoutRef) {
				clearTimeout(this._connectTimeoutRef);
			}

			delete this.resetPingTimeout;
		}

		super.webSocket = value;

		if (this.webSocket) {
			// WebSockets will throw an error if they are closed before they are completely open.
			// We hook into these events to supress those errors and clean them up after a connection is established.
			function onOpenCloseError(this: ws.WebSocket) {
				this.off('open', onOpenCloseError);
				this.off('close', onOpenCloseError);
				this.off('error', onOpenCloseError);
			}

			this.webSocket.on('open', onOpenCloseError);
			this.webSocket.on('close', onOpenCloseError);
			this.webSocket.on('error', onOpenCloseError);
			this.webSocket.on('ping', this.resetPingTimeout = this.resetPingTimeout.bind(this));
		}
	}

	public connect(options?: ConnectOptions) {
		let timeoutMs = this.connectTimeoutMs;

		if (options) {
			let changeOptions = false;

			if (options.timeoutMs) {
				timeoutMs = options.timeoutMs;
			}

			if (options.address) {
				changeOptions = true;
				this._uri = typeof options.address === 'string' ? new URL(options.address) : options.address;
			}

			if (options.wsOptions) {
				changeOptions = true;
				this._wsOptions = options.wsOptions;
			}

			if (changeOptions && this.status !== 'closed') {
				this.disconnect(
					1000,
					'Socket was disconnected by the client to initiate a new connection'
				);
			}	
		}

		if (this.status === 'closed') {
			this.webSocket = new ws.WebSocket(this._uri, this._wsOptions);

			this.socket.emit('connecting', {});

			this._connectTimeoutRef = setTimeout(() => {
				this.disconnect(4007);
			}, timeoutMs);
		}
	}

	private async handshake(): Promise<HandshakeStatus> {
		const token = await this.authEngine.loadToken();
		// Don't wait for this.state to be 'open'.
		// The underlying WebSocket (this.socket) is already open.
		// The casting to HandshakeStatus has to be here or typescript freaks out
		const status = await this.invoke(
			'#handshake',
			{ authToken: token },
			true
		) as HandshakeStatus;

		if ('authError' in status) {
			status.authError = hydrateError(status.authError);
		}

		return status;
	}
	
	override async setAuthorization(authToken: AuthToken): Promise<boolean>;
	override async setAuthorization(signedAuthToken: string, authToken?: AuthToken): Promise<boolean>;
	override async setAuthorization(signedAuthToken: string | AuthToken, authToken?: AuthToken): Promise<boolean> {
		const changed = super.setAuthorization(signedAuthToken as string, authToken);

		if (changed) {
			// Even if saving the auth token failes we do NOT want to throw an exception.
			this.authEngine.saveToken(this.signedAuthToken)
				.catch(err => {
					this.onError(err);
				});
		}

		return changed;
	}

/*
	protected onRequest(packet: AnyPacket<TServiceMap, TPrivateIncomingMap, TIncomingMap>): boolean {
		if (!('service' in packet) && packet.method === '#handshake') {
			const data: HandshakeOptions = packet.data;
		}
	}

*/
	public override disconnect(code=1000, reason?: string) {
		if (code !== 4007) {
			this.resetReconnect();
		}

		super.disconnect(code, reason);
	}

	private tryReconnect(initialDelay?: number): void {
		if (!this.autoReconnect) {
			return;
		}

		const exponent = this._connectAttempts++;
		let reconnectOptions = this.autoReconnect;
		let timeoutMs: number;

		if (initialDelay == null || exponent > 0) {
			const initialTimeout = Math.round(reconnectOptions.initialDelay + (reconnectOptions.randomness || 0) * Math.random());

			timeoutMs = Math.round(initialTimeout * Math.pow(reconnectOptions.multiplier, exponent));
		} else {
			timeoutMs = initialDelay;
		}

		if (timeoutMs > reconnectOptions.maxDelayMs) {
			timeoutMs = reconnectOptions.maxDelayMs;
		}

		this._pendingReconnectTimeout = timeoutMs;

		this.connect({ timeoutMs });
	}

	protected resetPingTimeout() {
		if (this._pingTimeoutRef) {
			clearTimeout(this._pingTimeoutRef);
		}

		if (!this.isPingTimeoutDisabled) {
			// Use `WebSocket#terminate()`, which immediately destroys the connection,
			// instead of `WebSocket#close()`, which waits for the close timer.
			// Delay should be equal to the interval at which your server
			// sends out pings plus a conservative assumption of the latency.
			this._pingTimeoutRef = setTimeout(() => {
				this.webSocket.close(4000);
			}, this.pingTimeoutMs);
		}
	}

	private resetReconnect() {
		this._pendingReconnectTimeout = null;
		this._connectAttempts = 0;
	}

	public get pingTimeoutMs(): number {
		return this._pingTimeoutMs;
	}

	public set pingTimeoutMs(value: number) {
		this._pingTimeoutMs = value;
		this.resetPingTimeout();
	}

	override transmit<TMethod extends keyof TOutgoingMap>(method: TMethod, arg?: Parameters<TOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	override transmit<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(options: [TService, TMethod], arg?: Parameters<TServiceMap[TService][TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	override transmit<TMethod extends keyof (TPrivateOutgoingMap & ServerPrivateMap)>(method: TMethod, arg?: Parameters<(TPrivateOutgoingMap & ServerPrivateMap)[TMethod]>[0], bypassMiddleware?: boolean): Promise<void>;
	override async transmit<TService extends keyof TServiceMap, TServiceMethod extends keyof TServiceMap[TService], TMethod extends keyof TOutgoingMap>(serviceAndMethod: TMethod | [TService, TServiceMethod], arg?: (Parameters<TOutgoingMap[TMethod]> | Parameters<TServiceMap[TService][TServiceMethod]>)[0], bypassMiddleware?: boolean): Promise<void> {
		if (this.status === 'closed') {
			this.connect();

			await this.socket.listen('connect').once();
		}

		await super.transmit(serviceAndMethod as TMethod, arg, bypassMiddleware);
	}

	override invoke<TMethod extends keyof TOutgoingMap>(method: TMethod, arg?: Parameters<TOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TOutgoingMap[TMethod]>>;
	override invoke<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(options: [TService, TMethod, (number | false)?], arg?: Parameters<TServiceMap[TService][TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TServiceMap[TService][TMethod]>>;
	override invoke<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(options: InvokeServiceOptions<TServiceMap, TService, TMethod>, arg?: Parameters<TServiceMap[TService][TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TServiceMap[TService][TMethod]>>;
	override invoke<TMethod extends keyof TOutgoingMap>(options: InvokeMethodOptions<TOutgoingMap, TMethod>, arg?: Parameters<TOutgoingMap[TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<TOutgoingMap[TMethod]>>;
	override invoke<TMethod extends keyof (TPrivateOutgoingMap & ServerPrivateMap)>(method: TMethod, arg: Parameters<(TPrivateOutgoingMap & ServerPrivateMap)[TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<(TPrivateOutgoingMap & ServerPrivateMap)[TMethod]>>;
	override invoke<TMethod extends keyof (TPrivateOutgoingMap & ServerPrivateMap)>(options: InvokeMethodOptions<(TPrivateOutgoingMap & ServerPrivateMap), TMethod>, arg?: Parameters<(TPrivateOutgoingMap & ServerPrivateMap)[TMethod]>[0], bypassMiddleware?: boolean): AbortablePromise<FunctionReturnType<(TPrivateOutgoingMap & ServerPrivateMap)[TMethod]>>;
	override async invoke<TService extends keyof TServiceMap, TServiceMethod extends keyof TServiceMap[TService], TMethod extends keyof TOutgoingMap, TPrivateMethod extends keyof (TPrivateOutgoingMap & ServerPrivateMap)>(
		methodOptions: TMethod | TPrivateMethod | [TService, TServiceMethod, (number | false)?] | InvokeServiceOptions<TServiceMap, TService, TServiceMethod> | InvokeMethodOptions<TOutgoingMap, TMethod> | InvokeMethodOptions<(TPrivateOutgoingMap & ServerPrivateMap), TPrivateMethod>,
		arg?: (Parameters<TOutgoingMap[TMethod]> | Parameters<(TPrivateOutgoingMap & ServerPrivateMap)[TPrivateMethod]> | Parameters<TServiceMap[TService][TServiceMethod]>)[0],
		bypassMiddleware?: boolean
	): Promise<FunctionReturnType<TOutgoingMap[TMethod] | (TPrivateOutgoingMap & ServerPrivateMap)[TPrivateMethod] | TServiceMap[TService][TServiceMethod]>> {
		if (this.status === 'closed') {
			this.connect();

			await this.socket.listen('connect').once();
		}

		return super.invoke(methodOptions as TMethod, arg, bypassMiddleware);
	}
}
