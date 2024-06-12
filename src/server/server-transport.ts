import { AnyPacket } from "../request.js";
import { ServerMap } from "../client/maps/server-map.js";
import { ServerSocket, ServerSocketOptions } from "./server-socket.js";
import { SocketTransport } from "../socket-transport.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { AuthError, socketProtocolErrorStatuses } from "@socket-mesh/errors";
import { SocketMapFromServer } from "../client/maps/socket-map.js";
import jwt from 'jsonwebtoken';
import { AuthTokenOptions } from "./auth-engine.js";
import { SocketStatus } from "../socket.js";
import { RawData } from "ws";
import { AnyResponse } from "../response.js";
import { ClientRequest, IncomingMessage } from "http";

export class ServerTransport<T extends ServerMap> extends SocketTransport<SocketMapFromServer<T>> {
	readonly service?: string;

	constructor(options: ServerSocketOptions<T>) {
		super(options);

		this.type = 'server';
		this.service = options.service;
		this.webSocket = options.socket;
		this.resetPingTimeout(this.state.server.isPingTimeoutDisabled ? false : this.state.server.pingTimeoutMs, 4001);
	}

	public override async changeToUnauthenticatedState(): Promise<boolean> {
		if (this.signedAuthToken) {
			const authToken = this.authToken;
			const signedAuthToken = this.signedAuthToken;

			this.state.server.emit('socketAuthStateChange', { socket: this.socket, wasAuthenticated: true, isAuthenticated: false });

			await super.changeToUnauthenticatedState();

			this.state.server.emit('socketDeauthenticate', { socket: this.socket, signedAuthToken, authToken });

			return true;
		}

		return false;
	}
	
	protected override decode(data: string | RawData): AnyPacket<SocketMapFromServer<T>> | AnyPacket<SocketMapFromServer<T>>[] | AnyResponse<SocketMapFromServer<T>> | AnyResponse<SocketMapFromServer<T>>[] | null {
		const packet = super.decode(data);

		if ((packet === null || typeof packet !== 'object') && this.state.server.strictHandshake && this.status === 'connecting') {
			this.disconnect(4009);
			return null;
		}

		return packet;
	}

	protected override onClose(code: number, reason?: string | Buffer): void {
		const status = this.status;
		const strReason = reason?.toString() || socketProtocolErrorStatuses[code];

		super.onClose(code, reason);

		this.state.server.emit('socketClose', { socket: this.socket, code, reason: strReason });

		this.onDisconnect(status, code, strReason);
	}
	
	protected override onDisconnect(status: SocketStatus, code: number, reason?: string): void {
		if (status === 'ready') {
			this.state.server.emit('socketDisconnect', { socket: this.socket, code, reason });
		} else {
			this.state.server.emit('socketConnectAbort', { socket: this.socket, code, reason });
		}

		super.onDisconnect(status, code, reason);

		if (!!this.state.server.clients[this.id]) {
			delete this.state.server.clients[this.id];
			this.state.server.clientCount--;
		}

		if (!!this.state.server.pendingClients[this.id]) {
			delete this.state.server.pendingClients[this.id];
			this.state.server.pendingClientCount--;
		}

		if (this.streamCleanupMode === 'kill') {
			(async () => {
				await this.socket.listen('end').once();
				this.socket.killListeners();
				this.inboundMessageStream.kill();
			})();
		} else if (this.streamCleanupMode === 'close') {
			(async () => {
				await this.socket.listen('end').once();
				this.socket.closeListeners();
				this.inboundMessageStream.close();
			})();
		}
		
		this.socket.emit('end');		
	}

	public override onError(error: Error): void {
		super.onError(error);
		this.state.server.emit('socketError', { socket: this.socket, error });
	}
	
	protected override onMessage(data: RawData, isBinary: boolean): void {
		this.state.server.emit('socketMessage', { socket: this.socket, data, isBinary });
		super.onMessage(data, isBinary);
	}

	protected override async onRequest(packet: AnyPacket<SocketMapFromServer<T>>, timestamp: Date): Promise<boolean> {
		let wasHandled = false;

		if (!this.service || !('service' in packet) || packet.service === this.service) {
			wasHandled = await super.onRequest(packet, timestamp);
		} else {
			wasHandled = this.onUnhandledRequest(packet);
		}

		return wasHandled;
	}

	protected override onPing(data: Buffer): void {
		if (this.state.server.strictHandshake && this.status === 'connecting') {
			this.disconnect(4009);
			return;
		}

		super.onPing(data);
		this.state.server.emit('socketPing', { socket: this.socket, data });	
	}

	protected override onPong(data: Buffer): void {
		this.resetPingTimeout(this.state.server.isPingTimeoutDisabled ? false : this.state.server.pingTimeoutMs, 4001);
		super.onPong(data);
		this.state.server.emit('socketPong', { socket: this.socket, data });
	}
	
	protected override onResponse(response: AnyResponse<SocketMapFromServer<T>>): void {
		super.onResponse(response);
		this.state.server.emit('socketResponse', { socket: this.socket, response });
	}

	protected override onUpgrade(request: IncomingMessage): void {
		super.onUpgrade(request);
		this.state.server.emit('socketUpgrade', { socket: this.socket, request });
	}
	
	protected override onUnexpectedResponse(request: ClientRequest, response: IncomingMessage): void {
		super.onUnexpectedResponse(request, response);
		this.state.server.emit('socketUnexpectedResponse', { socket: this.socket, request, response });
	}

	public override async setAuthorization(authToken: AuthToken, options?: AuthTokenOptions): Promise<boolean>;
	public override async setAuthorization(signedAuthToken: SignedAuthToken, authToken?: AuthToken): Promise<boolean>;
	public override async setAuthorization(authToken: AuthToken | SignedAuthToken, options?: AuthToken | AuthTokenOptions): Promise<boolean> {
		const wasAuthenticated = !!this.signedAuthToken;

		if (typeof authToken === 'string') {
			const changed = await super.setAuthorization(authToken, options as AuthToken);

			if (changed && this.status === 'ready') {
				this.triggerAuthenticationEvents(false, wasAuthenticated);
			}
			
			return changed;
		}

		const auth = this.state.server.auth;
		const rejectOnFailedDelivery = options?.rejectOnFailedDelivery;
		let signedAuthToken: string;

		delete options?.rejectOnFailedDelivery;

		try {
			signedAuthToken = await auth.signToken(authToken, auth, options as jwt.SignOptions);
		} catch (err) {
			this.onError(err);
			this.disconnect(4002, err.toString());
			throw err;
		}

		const changed = super.setAuthorization(signedAuthToken, authToken);

		if (changed && this.status === 'ready') {
			this.triggerAuthenticationEvents(true, wasAuthenticated);
		}

		if (rejectOnFailedDelivery) {
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

		try {
			await this.transmit('#setAuthToken', signedAuthToken);
		} catch (err) {
			if (err.name !== 'BadConnectionError') {
				throw err;
			}
		}

		return changed;
	}

	public override setReadyStatus(pingTimeoutMs: number, authError?: Error): void {
		super.setReadyStatus(pingTimeoutMs, authError);
		this.state.server.emit('socketConnect', { socket: this.socket, pingTimeoutMs, id: this.socket.id, isAuthenticated: !!this.signedAuthToken, authError });
	}

	public override get socket(): ServerSocket<T> {
		return super.socket as ServerSocket<T>;
	}

	public override set socket(value: ServerSocket<T>) {
		super.socket = value;
	}

	public override triggerAuthenticationEvents(wasSigned: boolean, wasAuthenticated: boolean): void {
		super.triggerAuthenticationEvents(wasSigned, wasAuthenticated);

		this.state.server.emit(
			'socketAuthStateChange',
			{ socket: this.socket, wasAuthenticated, isAuthenticated: true, authToken: this.authToken, signedAuthToken: this.signedAuthToken }
		);

		this.state.server.emit(
			'socketAuthenticate',
			{ socket: this.socket, wasSigned, signedAuthToken: this.signedAuthToken, authToken: this.authToken }
		);

	}

	public type: 'server'
}