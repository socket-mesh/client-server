import { AnyPacket } from "../request.js";
import { ServerMap, ServerPrivateMap } from "../client/maps/server-map.js";
import { ServerSocketOptions } from "./server-socket.js";
import { SocketTransport } from "../socket-transport.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { AuthError } from "@socket-mesh/errors";
import { SocketMapFromServer } from "../client/maps/socket-map.js";
import jwt from 'jsonwebtoken';

export class ServerTransport<T extends ServerMap> extends SocketTransport<SocketMapFromServer<T>> {
	readonly service?: string;

	constructor(options: ServerSocketOptions<T>) {
		super(options);

		this.service = options.service;
		this.webSocket = options.socket;
	}

	protected override onRequest(packet: AnyPacket<T['Service'], T["Incoming"] & T["PrivateIncoming"] & ServerPrivateMap>): boolean {
		let wasHandled = false;

		if (!this.service || !('service' in packet) || packet.service === this.service) {
			wasHandled = super.onRequest(packet);
		} else {
			wasHandled = this.onUnhandledRequest(packet);
		}

		return wasHandled;
	}

	public override async setAuthorization(authToken: AuthToken, options?: jwt.SignOptions): Promise<boolean>;
	public override async setAuthorization(signedAuthToken: SignedAuthToken, authToken?: AuthToken): Promise<boolean>;
	public override async setAuthorization(authToken: AuthToken | SignedAuthToken, options?: AuthToken | jwt.SignOptions): Promise<boolean> {
		const wasAuthenticated = !!this.signedAuthToken;

		if (typeof authToken === 'string') {
			const changed = await super.setAuthorization(authToken, options as AuthToken);

			if (changed && this.status === 'open') {
				this.triggerAuthenticationEvents(wasAuthenticated);
			}
			
			return changed;
		}

		const auth = this.state.server.auth;
		let signedAuthToken: string;

		try {
			signedAuthToken = await auth.signToken(authToken, options as jwt.SignOptions);
		} catch (err) {
			this.onError(err);
			this.disconnect(4002, err.toString());
			throw err;
		}

		const changed = super.setAuthorization(signedAuthToken, authToken);

		if (changed && this.status === 'open') {
			this.triggerAuthenticationEvents(wasAuthenticated);
		}
		
		if (auth.rejectOnFailedDelivery) {
			try {
				await this.invoke('#setAuthToken', signedAuthToken)[0];
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

		return changed;
	}
}