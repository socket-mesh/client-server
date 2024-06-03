import { Socket } from "../socket.js";
import { ClientTransport } from "./client-transport.js";
import { AutoReconnectOptions, ClientSocketOptions, ConnectOptions, parseClientOptions } from "./client-socket-options.js";
import { setAuthTokenHandler } from "./handlers/set-auth-token.js";
import { removeAuthTokenHandler } from "./handlers/remove-auth-token.js";
import { SignedAuthToken } from "@socket-mesh/auth";
import { hydrateError } from "@socket-mesh/errors";
import { wait } from "../utils.js";
import { ClientChannels } from "./client-channels.js";
import { SocketMapFromClient } from "./maps/socket-map.js";
import { ClientMap } from "./maps/client-map.js";
import { publishHandler } from "./handlers/publish.js";
import { kickOutHandler } from "./handlers/kickout.js";

export class ClientSocket<T extends ClientMap> extends Socket<SocketMapFromClient<T>> {
	private readonly _clientTransport: ClientTransport<T>;
	public readonly channels: ClientChannels<T>;

	constructor(address: string | URL);
	constructor(options: ClientSocketOptions<T>);
	constructor(options: ClientSocketOptions<T> | string | URL) {
		options = parseClientOptions(options);

		options.handlers = options.handlers || {};

		Object.assign(
			options.handlers,
			{
				"#kickOut": kickOutHandler,
				"#publish": publishHandler,
				"#setAuthToken": setAuthTokenHandler,
				"#removeAuthToken": removeAuthTokenHandler
			}
		);

		const clientTransport = new ClientTransport(options);

		super(clientTransport);

		this._clientTransport = clientTransport;
		this.channels = new ClientChannels<T>(this._clientTransport, options);

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