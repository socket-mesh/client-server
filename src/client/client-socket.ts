import { Socket } from "../socket.js";
import { ClientTransport } from "./client-transport.js";
import { AutoReconnectOptions, ClientSocketOptions, ConnectOptions, parseClientOptions } from "./client-socket-options.js";
import { setAuthTokenHandler } from "./handlers/set-auth-token.js";
import { removeAuthTokenHandler } from "./handlers/remove-auth-token.js";
import { SignedAuthToken } from "@socket-mesh/auth";
import { hydrateError } from "@socket-mesh/errors";
import { wait } from "../utils.js";
import { Channels } from "./channels/channels.js";
import { SocketMapFromClient } from "./maps/socket-map.js";
import { ClientMap } from "./maps/client-map.js";
import { publishHandler } from "./handlers/publish.js";

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

export class ClientSocket<T extends ClientMap> extends Socket<SocketMapFromClient<T>> {
	private readonly _clientTransport: ClientTransport<T>;
	public readonly channels: Channels<T>;

	constructor(address: string | URL);
	constructor(options: ClientSocketOptions<T>);
	constructor(options: ClientSocketOptions<T> | string | URL) {
		options = parseClientOptions(options);

		options.handlers = options.handlers || {};

		Object.assign(
			options.handlers,
			{
				"#publish": publishHandler,
				"#setAuthToken": setAuthTokenHandler,
				"#removeAuthToken": removeAuthTokenHandler
			}
		);

		const clientTransport = new ClientTransport(options);

		super(clientTransport);

		this._clientTransport = clientTransport;
		this.channels = new Channels<T>(this._clientTransport, options);

		if (options.autoConnect !== false) {
			this.connect(options);
		}
	}

	public get uri(): URL {
		return this._clientTransport.uri;
	}

	public get autoReconnect(): AutoReconnectOptions | false {
		return this._clientTransport.autoReconnect;
	}
	
	public set autoReconnect(value: Partial<AutoReconnectOptions> | boolean) {
		this._clientTransport.autoReconnect = value;
	}

	public get connectTimeoutMs(): number {
		return this._clientTransport.connectTimeoutMs;
	}

	public set connectTimeoutMs(timeoutMs: number) {
		this._clientTransport.connectTimeoutMs = timeoutMs;
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

	public connect(options?: ConnectOptions): void {
		this._clientTransport.connect(options);
	}

	public reconnect(code?: number, reason?: string) {
		this.disconnect(code, reason);
		this.connect();
	}

	public async authenticate(signedAuthToken: SignedAuthToken): Promise<void> {
		try {
			await this._clientTransport.invoke('#authenticate', signedAuthToken);

			this._clientTransport.setAuthorization(signedAuthToken);

			// In order for the events to trigger we need to wait for the next tick.
			await wait(0);
		} catch (err) {
			if (err.name !== 'BadConnectionError' && err.name !== 'TimeoutError') {
				// In case of a bad/closed connection or a timeout, we maintain the last
				// known auth state since those errors don't mean that the token is invalid.
				await this._clientTransport.deauthenticate();

				// In order for the events to trigger we need to wait for the next tick.
				await wait(0);
			}

			throw hydrateError(err);
		}
	}

	async deauthenticate() {
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

		await this._clientTransport.deauthenticate();

		// In order for the events to trigger we need to wait for the next tick.
		await wait(0);
	}

/*
	protected onRequest(packet: AnyPacket<TServiceMap, TPrivateIncomingMap, TIncomingMap>): boolean {
		if (!('service' in packet) && packet.method === '#handshake') {
			const data: HandshakeOptions = packet.data;
		}
	}
*/
}