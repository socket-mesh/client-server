import { AnyPacket } from "../request.js";
import { ServerPrivateMap } from "../client/maps/server-private-map.js";
import { ServerSocket, ServerSocketOptions } from "./server-socket.js";
import { SocketTransport } from "../socket-transport.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { AuthError } from "@socket-mesh/errors";
import { ServerMap, SocketMapFromServer } from "../client/maps/socket-map.js";

export class ServerTransport<T extends ServerMap> extends SocketTransport<SocketMapFromServer<T>> {
	readonly service?: string;

	constructor(
		options:
			ServerSocketOptions<T, ServerSocket<T>>
	) {
		super(options);

		this.service = options.service;
		this.webSocket = options.socket;
	}

	protected override onRequest(packet: AnyPacket<T['Service'], T['Incoming'] & T['PrivateIncoming'] & ServerPrivateMap>): boolean {
		let wasHandled = false;

		if (!this.service || !('service' in packet) || packet.service === this.service) {
			wasHandled = super.onRequest(packet);
		} else {
			wasHandled = this.onUnhandledRequest(packet);
		}

		return wasHandled;
	}

	public override async setAuthorization(authToken: AuthToken): Promise<boolean>;
	public override async setAuthorization(signedAuthToken: SignedAuthToken, authToken?: AuthToken): Promise<boolean>;
	public override async setAuthorization(signedAuthToken: AuthToken | SignedAuthToken, authToken?: AuthToken): Promise<boolean> {
		if (typeof signedAuthToken === 'string') {
			return super.setAuthorization(signedAuthToken, authToken);
		}

		const auth = this.state.server.auth;

		try {
			authToken = signedAuthToken;
			signedAuthToken = await auth.signToken(authToken);
		} catch (err) {
			this.onError(err);
			this.disconnect(4002, err.toString());
			throw err;
		}

		const result = super.setAuthorization(signedAuthToken, authToken);

		if (auth.rejectOnFailedDelivery) {
			try {
				await this.invoke('#setAuthToken', signedAuthToken);
			} catch (err) {
				let error: AuthError;

				if (err && typeof err.message === 'string') {
					error = new AuthError(`Failed to deliver auth token to client - ${err.message}`);
				} else {
					error = new AuthError(
						'Failed to confirm delivery of auth token to client due to malformatted error response'
					);
				}

				this.onError(error);
				throw error;
			}
			return;
		}

		await this.transmit('#setAuthToken', signedAuthToken);

		return result;
	}
}