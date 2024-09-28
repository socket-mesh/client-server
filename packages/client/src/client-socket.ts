import { ClientTransport } from "./client-transport.js";
import { AutoReconnectOptions, ClientSocketOptions, ConnectOptions, parseClientOptions } from "./client-socket-options.js";
import { setAuthTokenHandler } from "./handlers/set-auth-token.js";
import { removeAuthTokenHandler } from "./handlers/remove-auth-token.js";
import { SignedAuthToken } from "@socket-mesh/auth";
import { hydrateError } from "@socket-mesh/errors";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap, Socket, wait } from "@socket-mesh/core";
import { ClientChannels } from "./client-channels.js";
import { ClientPrivateMap } from "./maps/client-map.js";
import { publishHandler } from "./handlers/publish.js";
import { kickOutHandler } from "./handlers/kickout.js";
import { ChannelMap } from "@socket-mesh/channels";
import { ServerPrivateMap } from "./maps/server-map.js";

export class ClientSocket<
	TChannel extends ChannelMap = ChannelMap,
	TIncoming extends MethodMap = {},
	TService extends ServiceMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TState extends object = {}
> extends Socket<
	TIncoming & ClientPrivateMap,
	TOutgoing,
	TPrivateOutgoing & ServerPrivateMap,
	TService,
	TState
> {
	private readonly _clientTransport: ClientTransport<TIncoming, TService, TOutgoing, TPrivateOutgoing, TState>;
	public readonly channels: ClientChannels<TChannel, TIncoming, TService, TOutgoing, TPrivateOutgoing, TState>;

	constructor(address: string | URL);
	constructor(options: ClientSocketOptions<TOutgoing, TIncoming, TService, TPrivateOutgoing, TState>);
	constructor(options: ClientSocketOptions<TOutgoing, TIncoming, TService, TPrivateOutgoing, TState> | string | URL) {
		options = parseClientOptions(options);

		options.handlers = 
			Object.assign(
				{
					"#kickOut": kickOutHandler,
					"#publish": publishHandler,
					"#setAuthToken": setAuthTokenHandler,
					"#removeAuthToken": removeAuthTokenHandler
				},
				options.handlers
			);

		const clientTransport = new ClientTransport(options);

		super(clientTransport, options);

		this._clientTransport = clientTransport;
		this.channels = new ClientChannels<TChannel, TIncoming, TService, TOutgoing, TPrivateOutgoing, TState>(this._clientTransport, options);

		if (options.autoConnect !== false) {
			this.connect(options);
		}
	}
	
	public async authenticate(signedAuthToken: SignedAuthToken): Promise<void> {
		try {
			await this._clientTransport.invoke('#authenticate', signedAuthToken)[0];

			this._clientTransport.setAuthorization(signedAuthToken);

			// In order for the events to trigger we need to wait for the next tick.
			await wait(0);
		} catch (err) {
			if (err.name !== 'BadConnectionError' && err.name !== 'TimeoutError') {
				// In case of a bad/closed connection or a timeout, we maintain the last
				// known auth state since those errors don't mean that the token is invalid.
				await this._clientTransport.changeToUnauthenticatedState();

				// In order for the events to trigger we need to wait for the next tick.
				await wait(0);
			}

			throw hydrateError(err);
		}
	}

	public get autoReconnect(): AutoReconnectOptions | false {
		return this._clientTransport.autoReconnect;
	}

	public set autoReconnect(value: Partial<AutoReconnectOptions> | boolean) {
		this._clientTransport.autoReconnect = value;
	}

	public connect(options?: ConnectOptions): void {
		this._clientTransport.connect(options);
	}

	public get connectTimeoutMs(): number {
		return this._clientTransport.connectTimeoutMs;
	}

	public set connectTimeoutMs(timeoutMs: number) {
		this._clientTransport.connectTimeoutMs = timeoutMs;
	}

	async deauthenticate(): Promise<boolean> {
		(async () => {
			let oldAuthToken: SignedAuthToken;
			try {
				oldAuthToken = await this._clientTransport.authEngine.removeToken();
			} catch (err) {
				this._clientTransport.onError(err);
				return;
			}
			this.emit('removeAuthToken', { oldAuthToken });
		})();

		if (this.status !== 'closed') {
			await this._clientTransport.transmit('#removeAuthToken');
		}

		return await super.deauthenticate();
	}

	public get isPingTimeoutDisabled(): boolean {
		return this._clientTransport.isPingTimeoutDisabled;
	}

	public set isPingTimeoutDisabled(isDisabled: boolean) {
		this._clientTransport.isPingTimeoutDisabled = isDisabled;
	}

	public get pingTimeoutMs(): number {
		return this._clientTransport.pingTimeoutMs;
	}

	public set pingTimeoutMs(timeoutMs: number) {
		this._clientTransport.pingTimeoutMs = timeoutMs;
	}

	public reconnect(code?: number, reason?: string) {
		this.disconnect(code, reason);
		this.connect();
	}

	get type(): 'client' {
		return this._clientTransport.type;
	}

	public get uri(): URL {
		return this._clientTransport.uri;
	}
}