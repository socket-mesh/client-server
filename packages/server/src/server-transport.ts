import { ServerSocket, ServerSocketOptions } from "./server-socket.js";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { AuthError, BrokerError, InvalidActionError, socketProtocolErrorStatuses } from "@socket-mesh/errors";
import jwt from 'jsonwebtoken';
import { AuthTokenOptions } from "@socket-mesh/auth-engine";
import { Data } from "ws";
import { AnyPacket, AnyResponse, SocketStatus, SocketTransport, abortRequest, InvokeMethodRequest, InvokeServiceRequest, TransmitMethodRequest, TransmitServiceRequest, InboundMessage, ServiceMap, PublicMethodMap, PrivateMethodMap } from "@socket-mesh/core";
import { IncomingMessage } from "http";
import { ServerPlugin } from "./plugin/server-plugin.js";
import { ChannelMap, PublishOptions } from "@socket-mesh/channels";
import base64id from "base64id";
import { ClientPrivateMap, ServerPrivateMap } from "@socket-mesh/client";
import { ServerSocketState } from "./server-socket-state.js";

export class ServerTransport<
	TChannel extends ChannelMap = {},
	TService extends ServiceMap = {},
	TIncoming extends PublicMethodMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateIncoming extends PrivateMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TServerState extends object = {},
	TState extends object = {}
> extends SocketTransport<
	TIncoming & TPrivateIncoming & ServerPrivateMap,
	TOutgoing,
	TPrivateOutgoing & ClientPrivateMap,
	TService,
	TState & ServerSocketState
> {
	public readonly plugins: ServerPlugin<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>[];
	public readonly service?: string;
	public readonly request: IncomingMessage;

	constructor(options: ServerSocketOptions<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>) {
		super(options);

		this.type = 'server';
		this.request = options.request;
		this.plugins = options.plugins;
		this.service = options.service;
		this.webSocket = options.socket;
		this.id = (options.id || base64id.generateId());		

		// Server is not set on socket until the socket constructor is completed so pull it from the options.
		this.resetPingTimeout(
			options.server.isPingTimeoutDisabled ? false : options.server.pingTimeoutMs,
			4001
		);
	}

	public override async changeToUnauthenticatedState(): Promise<boolean> {
		if (this.signedAuthToken) {
			const authToken = this.authToken;
			const signedAuthToken = this.signedAuthToken;

			this.socket.server.emit('socketAuthStateChange', { socket: this.socket, wasAuthenticated: true, isAuthenticated: false });

			await super.changeToUnauthenticatedState();

			this.socket.server.emit('socketDeauthenticate', { socket: this.socket, signedAuthToken, authToken });

			return true;
		}

		return false;
	}

	protected handleInboudMessage(
		{ packet, timestamp }: InboundMessage<TIncoming & TPrivateIncoming & ServerPrivateMap, TOutgoing, TPrivateOutgoing & ClientPrivateMap, TService>
	): Promise<void> {
		if ((packet === null || typeof packet !== 'object') && this.socket.server.strictHandshake && this.status === 'connecting') {
			this.disconnect(4009);
			return;
		}

		return super.handleInboudMessage({ packet, timestamp });
	}

	protected override onClose(code: number, reason?: string | Buffer): void {
		const status = this.status;
		const strReason = reason?.toString() || socketProtocolErrorStatuses[code];

		super.onClose(code, reason);

		this.socket.server.emit('socketClose', { socket: this.socket, code, reason: strReason });

		this.onDisconnect(status, code, strReason);
	}
	
	protected override onDisconnect(status: SocketStatus, code: number, reason?: string): void {
		if (status === 'ready') {
			this.socket.server.emit('socketDisconnect', { socket: this.socket, code, reason });
		} else {
			this.socket.server.emit('socketConnectAbort', { socket: this.socket, code, reason });
		}

		super.onDisconnect(status, code, reason);

		if (this.socket.state.channelSubscriptions) {
			const channels = Object.keys(this.socket.state.channelSubscriptions);

			channels.map((channel) => this.unsubscribe(channel));	
		}

		if (this.streamCleanupMode !== 'none') {
			(async () => {
				await this.socket.listen('end').once();

				if (this.streamCleanupMode === 'kill') {
					this.socket.killListeners();
				} else if (this.streamCleanupMode === 'close') {
					this.socket.closeListeners();
				}
			
				for (let i = 0; i < this.plugins.length; i++) {
					const plugin = this.plugins[i];
		
					if (plugin.onEnd) {
						plugin.onEnd({ socket: this.socket, transport: this });
					}
				}
			})();
		}
		
		this.socket.emit('end');		
	}

	public override onError(error: Error): void {
		super.onError(error);
		this.socket.server.emit('socketError', { socket: this.socket, error });
	}
	
	protected override onInvoke<
		TServiceName extends keyof TService,
		TServiceMethod extends keyof TService[TServiceName],
		TMethod extends keyof TOutgoing, TPrivateMethod extends keyof TPrivateOutgoing
	>(request: InvokeMethodRequest<TOutgoing, TMethod> | InvokeMethodRequest<TPrivateOutgoing, TPrivateMethod> | InvokeServiceRequest<TService, TServiceName, TServiceMethod>): void {
		if (request.method !== '#publish') {
			super.onInvoke(request);
			return;
		}

		this.onPublish(request.data)
			.then(() => {
				super.onInvoke(request);
			})
			.catch(err => {
				abortRequest(request as InvokeMethodRequest<TOutgoing, TMethod>, err);
			});
	}

	protected override onMessage(data: Data, isBinary: boolean): void {
		this.socket.server.emit('socketMessage', { socket: this.socket, data, isBinary });
		super.onMessage(data, isBinary);
	}

/*
	protected override onPing(data: Buffer): void {
		if (this.socket.server.strictHandshake && this.status === 'connecting') {
			this.disconnect(4009);
			return;
		}

		super.onPing(data);
		this.socket.server.emit('socketPing', { socket: this.socket, data });	
	}
*/

	protected override onPingPong(): void {
		if (this.socket.server.strictHandshake && this.status === 'connecting') {
			this.disconnect(4009);
			return;
		}

		this.resetPingTimeout(this.socket.server.isPingTimeoutDisabled ? false : this.socket.server.pingTimeoutMs, 4001);
		this.socket.emit('pong', {});
		this.socket.server.emit('socketPong', { socket: this.socket });
	}

	protected async onPublish(options: PublishOptions): Promise<void> {
		let data = options.data;

		for (const plugin of this.plugins) {
			if ('onPublishOut' in plugin) {
				data = await plugin.onPublishOut({ socket: this.socket, transport: this, channel: options.channel, data });
			}
		}

		options.data = data;
	}

	protected override async onRequest(
		packet: AnyPacket<TIncoming & TPrivateIncoming & ServerPrivateMap, TService>,
		timestamp: Date,
		pluginError?: Error
	): Promise<boolean> {
		let wasHandled = false;

		if (!this.service || !('service' in packet) || packet.service === this.service) {
			if (this.socket.server.strictHandshake && this.status === 'connecting' && packet.method !== '#handshake') {
				this.disconnect(4009);
				return true;
			}

			wasHandled = await super.onRequest(packet, timestamp, pluginError);
		} else {
			wasHandled = this.onUnhandledRequest(packet);
		}

		return wasHandled;
	}
	
	protected override onResponse(response: AnyResponse<TOutgoing, TPrivateOutgoing & ClientPrivateMap, TService>): void {
		super.onResponse(response);
		this.socket.server.emit('socketResponse', { socket: this.socket, response });
	}

	protected override onTransmit<
		TServiceName extends keyof TService,
		TServiceMethod extends keyof TService[TServiceName],
		TMethod extends keyof TOutgoing
	>(request: TransmitMethodRequest<TOutgoing, TMethod> | TransmitServiceRequest<TService, TServiceName, TServiceMethod>): void {
		if (request.method !== '#publish') {
			super.onTransmit(request);
			return;
		}
		this.onPublish(request.data)
			.then(() => {
				super.onTransmit(request);
			})
			.catch(err => {
				abortRequest(request as TransmitMethodRequest<TOutgoing, TMethod>, err);
			});
	}

	public ping(): Promise<void> {
		return this.send('');
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

		if (this.status === 'connecting') {
			const err = new InvalidActionError(
				'Cannot call setAuthToken before completing the handshake'
			);
			throw err;
		}

		const auth = this.socket.server.auth;
		const rejectOnFailedDelivery = options?.rejectOnFailedDelivery;
		let signedAuthToken: string;

		delete options?.rejectOnFailedDelivery;

		try {
			signedAuthToken = await auth.signToken(authToken, options as jwt.SignOptions);
		} catch (err) {
			this.onError(err);
			this.disconnect(4002, err.toString());
			throw err;
		}

		const changed = await super.setAuthorization(signedAuthToken, authToken);

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
		this.socket.server.emit('socketConnect', { socket: this.socket, pingTimeoutMs, id: this.socket.id, isAuthenticated: !!this.signedAuthToken, authError });
	}

	public override get socket(): ServerSocket<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState> {
		return super.socket as ServerSocket<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>;
	}

	public override set socket(value: ServerSocket<TChannel, TService, TIncoming, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>) {
		super.socket = value;
	}

	public override triggerAuthenticationEvents(wasSigned: boolean, wasAuthenticated: boolean): void {
		super.triggerAuthenticationEvents(wasSigned, wasAuthenticated);

		this.socket.server.emit(
			'socketAuthStateChange',
			{ socket: this.socket, wasAuthenticated, isAuthenticated: true, authToken: this.authToken, signedAuthToken: this.signedAuthToken }
		);

		this.socket.server.emit(
			'socketAuthenticate',
			{ socket: this.socket, wasSigned, signedAuthToken: this.signedAuthToken, authToken: this.authToken }
		);

	}

	public type: 'server'

	public async unsubscribe(channel: string): Promise<void> {
		if (typeof channel !== 'string') {
			throw new InvalidActionError(
				`Socket ${this.id} tried to unsubscribe from an invalid channel name`
			);
		}
	
		if (!this.socket.state.channelSubscriptions?.[channel]) {
			throw new InvalidActionError(
				`Socket ${this.id} tried to unsubscribe from a channel which it is not subscribed to`
			);
		}

		try {
			const server = this.socket.server;
			await server.brokerEngine.unsubscribe(this, channel);
			delete this.socket.state.channelSubscriptions[channel];
	
			if (this.socket.state.channelSubscriptionsCount != null) {
				this.socket.state.channelSubscriptionsCount--;
			}
	
			server.exchange.emit('unsubscribe', { channel });
		} catch (err) {
			throw new BrokerError(`Failed to unsubscribe socket from the ${channel} channel - ${err}`);
		}		
	}
}