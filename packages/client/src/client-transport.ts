import { FunctionReturnType, InvokeMethodOptions, InvokeServiceOptions, SocketTransport, SocketStatus, MethodMap, ServiceMap, PublicMethodMap, PrivateMethodMap } from "@socket-mesh/core";
import ws from "isomorphic-ws";
import { ClientAuthEngine, LocalStorageAuthEngine, isAuthEngine } from "./client-auth-engine.js";
import { hydrateError, socketProtocolErrorStatuses } from "@socket-mesh/errors";
import { ServerPrivateMap, HandshakeStatus } from "./maps/server-map.js";
import { AutoReconnectOptions, ClientSocketOptions, ConnectOptions } from "./client-socket-options.js";
import { AuthToken } from "@socket-mesh/auth";
import { ClientPrivateMap } from "./maps/client-map.js";

export class ClientTransport<
	TIncoming extends MethodMap,
	TService extends ServiceMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TState extends object
> extends SocketTransport<
	TIncoming & ClientPrivateMap,
	TOutgoing,
	TPrivateOutgoing & ServerPrivateMap,
	TService,
	TState
> {
	public readonly authEngine: ClientAuthEngine;

	private _uri: URL;
	private _wsOptions: ws.ClientOptions;

	public connectTimeoutMs: number;
	private _connectTimeoutRef: NodeJS.Timeout | null;

	private _autoReconnect: AutoReconnectOptions | false;
	private _connectAttempts: number;
	private _pendingReconnectTimeout: number | null;
	private _pingTimeoutMs: number;
	public isPingTimeoutDisabled: boolean;

	constructor(options: ClientSocketOptions<TOutgoing, TService, TIncoming, TPrivateOutgoing, TState>) {
		super(options);

		this.type = 'client';
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

		this.connectTimeoutMs = options.connectTimeoutMs ?? 20000;
		this._pingTimeoutMs = this.connectTimeoutMs;

		if (options.wsOptions) {
			this._wsOptions = options.wsOptions;
		}

		this._connectAttempts = 0;
		this._pendingReconnectTimeout = null;
		this.autoReconnect = options.autoReconnect;
		this.isPingTimeoutDisabled = (options.isPingTimeoutDisabled === true);
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

	public connect(options?: ConnectOptions) {
		let timeoutMs = this.connectTimeoutMs;

		if (options) {
			let changeOptions = false;

			if (options.connectTimeoutMs) {
				timeoutMs = options.connectTimeoutMs;
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
			this.webSocket = new ws(this._uri, this._wsOptions);

			this.socket.emit('connecting', {});

			this._connectTimeoutRef = setTimeout(() => {
				this.disconnect(4007);
			}, timeoutMs);
		}
	}

	public get connectAttempts(): number {
		return this._connectAttempts;
	}

	public override disconnect(code=1000, reason?: string) {
		if (code !== 4007) {
			this.resetReconnect();
		}

		super.disconnect(code, reason);
	}

	private async handshake(): Promise<HandshakeStatus> {
		const token = await this.authEngine.loadToken();
		// Don't wait for this.state to be 'ready'.
		// The underlying WebSocket (this.socket) is already open.
		// The casting to HandshakeStatus has to be here or typescript freaks out
		const status = await this.invoke(
			'#handshake',
			{ authToken: token }
		)[0] as HandshakeStatus;

		if ('authError' in status) {
			status.authError = hydrateError(status.authError);
		}

		return status;
	}

	protected override onClose(code: number, reason?: Buffer) {
		const status = this.status;
		let reconnecting = false;

		super.onClose(code, reason);

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
				reconnecting = !!this.autoReconnect;
				this.tryReconnect(0);

				// Codes 4500 and above will be treated as permanent disconnects.
				// Socket will not try to auto-reconnect.
			} else if (code !== 1000 && code < 4500) {
				reconnecting = !!this.autoReconnect;
				this.tryReconnect();
			}
		}
		if (!reconnecting) {
			const strReason = reason?.toString() || socketProtocolErrorStatuses[code];

			this.onDisconnect(status, code, strReason);
		}
	}

	protected override onOpen() {
		super.onOpen();

		clearTimeout(this._connectTimeoutRef);
		this._connectTimeoutRef = null;
		this.resetReconnect();
		this.resetPingTimeout(this.isPingTimeoutDisabled ? false : this.pingTimeoutMs, 4000);

		let authError: Error;

		this.handshake()
			.then(status => {
				this.id = status.id;
				this.pingTimeoutMs = status.pingTimeoutMs;

				if ('authToken' in status && status.authToken) {
					return this.setAuthorization(status.authToken);
				}

				if ('authError' in status) {
					authError = status.authError;
				}

				return this.changeToUnauthenticatedState();
			})
			.then(() => {
				this.setReadyStatus(this.pingTimeoutMs, authError);
			})
			.catch(err => {
				if (err.statusCode == null) {
					err.statusCode = 4003;
				}
				this.onError(err);
				this.disconnect(err.statusCode, err.toString());
			});
	}

	protected override onPingPong() {
		this.send('');
		this.resetPingTimeout(this.isPingTimeoutDisabled ? false : this.pingTimeoutMs, 4000);
		this.socket.emit('ping', {});
	}

	public get pendingReconnect(): boolean {
		return (this._pendingReconnectTimeout !== null);
	}

	public get pingTimeoutMs(): number {
		return this._pingTimeoutMs;
	}

	public set pingTimeoutMs(value: number) {
		this._pingTimeoutMs = value;
		this.resetPingTimeout(this.isPingTimeoutDisabled ? false : this.pingTimeoutMs, 4000);
	}

	private resetReconnect() {
		this._pendingReconnectTimeout = null;
		this._connectAttempts = 0;
	}

	public async send(data: Buffer | string): Promise<void> {
		this.webSocket.send(data);
	}

	override async setAuthorization(authToken: AuthToken): Promise<boolean>;
	override async setAuthorization(signedAuthToken: string, authToken?: AuthToken): Promise<boolean>;
	override async setAuthorization(signedAuthToken: string | AuthToken, authToken?: AuthToken): Promise<boolean> {
		const wasAuthenticated = !!this.signedAuthToken;
		const changed = await super.setAuthorization(signedAuthToken as string, authToken);

		if (changed) {
			this.triggerAuthenticationEvents(false, wasAuthenticated);
			// Even if saving the auth token failes we do NOT want to throw an exception.
			this.authEngine.saveToken(this.signedAuthToken)
				.catch(err => {
					this.onError(err);
				});
		}

		return changed;
	}

	public override get status(): SocketStatus {
		if (this.pendingReconnect) {
			return 'connecting';
		}

		return super.status;
	}

	private tryReconnect(initialDelay?: number): void {
		if (!this.autoReconnect) {
			return;
		}

		const exponent = this._connectAttempts++;
		const reconnectOptions = this.autoReconnect;
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

		this.connect({ connectTimeoutMs: timeoutMs });
	}

	public type: 'client'

	public get uri(): URL {
		return this._uri
	}

	protected get webSocket() {
		return super.webSocket;
	}

	protected set webSocket(value: ws.WebSocket | null) {
		if (this.webSocket) {
			if (this._connectTimeoutRef) {
				clearTimeout(this._connectTimeoutRef);
				this._connectTimeoutRef = null;
			}
		}

		super.webSocket = value;

		if (this.webSocket && this.webSocket.on) {
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
		}
	}

	override transmit<TMethod extends keyof TOutgoing>(method: TMethod, arg?: Parameters<TOutgoing[TMethod]>[0]): Promise<void>;
	override transmit<TServiceName extends keyof TService, TMethod extends keyof TService[TServiceName]>(options: [TServiceName, TMethod], arg?: Parameters<TService[TServiceName][TMethod]>[0]): Promise<void>;
	override transmit<TMethod extends keyof (TPrivateOutgoing & ServerPrivateMap)>(method: TMethod, arg?: Parameters<(TPrivateOutgoing & ServerPrivateMap)[TMethod]>[0]): Promise<void>;
	override async transmit<TServiceName extends keyof TService, TServiceMethod extends keyof TService[TServiceName], TMethod extends keyof TOutgoing>(serviceAndMethod: TMethod | [TServiceName, TServiceMethod], arg?: (Parameters<TOutgoing[TMethod]> | Parameters<TService[TServiceName][TServiceMethod]>)[0]): Promise<void> {
		if (this.status === 'closed') {
			this.connect();

			await this.socket.listen('connect').once();
		}

		await super.transmit(serviceAndMethod as TMethod, arg);
	}

	override invoke<TMethod extends keyof TOutgoing>(method: TMethod, arg?: Parameters<TOutgoing[TMethod]>[0]): [Promise<FunctionReturnType<TOutgoing[TMethod]>>, () => void];
	override invoke<TServiceName extends keyof TService, TMethod extends keyof TService[TServiceName]>(options: [TServiceName, TMethod, (number | false)?], arg?: Parameters<TService[TServiceName][TMethod]>[0]): [Promise<FunctionReturnType<TService[TServiceName][TMethod]>>, () => void];
	override invoke<TServiceName extends keyof TService, TMethod extends keyof TService[TServiceName]>(options: InvokeServiceOptions<TService, TServiceName, TMethod>, arg?: Parameters<TService[TServiceName][TMethod]>[0]): [Promise<FunctionReturnType<TService[TServiceName][TMethod]>>, () => void];
	override invoke<TMethod extends keyof TOutgoing>(options: InvokeMethodOptions<TOutgoing, TMethod>, arg?: Parameters<TOutgoing[TMethod]>[0]): [Promise<FunctionReturnType<TOutgoing[TMethod]>>, () => void];
	override invoke<TMethod extends keyof (TPrivateOutgoing & ServerPrivateMap)>(method: TMethod, arg: Parameters<(TPrivateOutgoing & ServerPrivateMap)[TMethod]>[0]): [Promise<FunctionReturnType<(TPrivateOutgoing & ServerPrivateMap)[TMethod]>>, () => void];
	override invoke<TMethod extends keyof (TPrivateOutgoing & ServerPrivateMap)>(options: InvokeMethodOptions<(TPrivateOutgoing & ServerPrivateMap), TMethod>, arg?: Parameters<(TPrivateOutgoing & ServerPrivateMap)[TMethod]>[0]): [Promise<FunctionReturnType<(TPrivateOutgoing & ServerPrivateMap)[TMethod]>>, () => void];
	override invoke<TServiceName extends keyof TService, TServiceMethod extends keyof TService[TServiceName], TMethod extends keyof TOutgoing, TPrivateMethod extends keyof (TPrivateOutgoing & ServerPrivateMap)>(
		methodOptions: TMethod | TPrivateMethod | [TServiceName, TServiceMethod, (number | false)?] | InvokeServiceOptions<TService, TServiceName, TServiceMethod> | InvokeMethodOptions<TOutgoing, TMethod> | InvokeMethodOptions<(TPrivateOutgoing & ServerPrivateMap), TPrivateMethod>,
		arg?: (Parameters<TOutgoing[TMethod]> | Parameters<(TPrivateOutgoing & ServerPrivateMap)[TPrivateMethod]> | Parameters<TService[TServiceName][TServiceMethod]>)[0]
	): [Promise<FunctionReturnType<TOutgoing[TMethod] | (TPrivateOutgoing & ServerPrivateMap)[TPrivateMethod] | TService[TServiceName][TServiceMethod]>>, () => void] {
		let abort: () => void;

		return [
			Promise.resolve()
				.then(() => {
					if (this.status === 'closed') {
						this.connect();
			
						return this.socket.listen('connect').once();
					}
				})
				.then(() => {
					const result = super.invoke(methodOptions as TMethod, arg);
					abort = result[1];

					return result[0];
				}),
			abort
		];
	}
}
