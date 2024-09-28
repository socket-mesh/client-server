import { CodecEngine } from "@socket-mesh/formatter";
import { AnyPacket } from "./packet.js";
import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";
import { SocketEvent, AuthenticateEvent, BadAuthTokenEvent, CloseEvent, ConnectEvent, DisconnectEvent, ErrorEvent, MessageEvent, PingEvent, PongEvent, RequestEvent, ResponseEvent, AuthStateChangeEvent, RemoveAuthTokenEvent, ConnectingEvent, DeauthenticateEvent } from "./socket-event.js";
import { FunctionReturnType, MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./maps/method-map.js";
import { HandlerMap } from "./maps/handler-map.js";
import { CallIdGenerator, InvokeMethodOptions, InvokeServiceOptions, SocketTransport } from "./socket-transport.js";
import { DemuxedConsumableStream, StreamEvent } from "@socket-mesh/stream-demux";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { Plugin } from "./plugins/plugin.js";

export type StreamCleanupMode = 'kill' | 'close' | 'none';

export interface SocketOptions<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object,
	TSocket extends Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> = Socket<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>
> {
	ackTimeoutMs?: number,
	callIdGenerator?: CallIdGenerator,
	codecEngine?: CodecEngine,
	handlers?: HandlerMap<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>;
	isPingTimeoutDisabled?: boolean;
	plugins?: Plugin<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>[],
	onUnhandledRequest?: (socket: TSocket, packet: AnyPacket<TIncoming, TService>) => boolean,
	state?: Partial<TState>,

	// Lets you specify the default cleanup behaviour for
	// when a socket becomes disconnected.
	// Can be either 'kill' or 'close'. Kill mode means
	// that all of the socket's streams will be killed and
	// so consumption will stop immediately.
	// Close mode means that consumers on the socket will
	// be able to finish processing their stream backlogs
	// bebfore they are ended.
	streamCleanupMode?: StreamCleanupMode
}

export type SocketStatus = 'connecting' | 'ready' | 'closing' | 'closed';

export class Socket<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> extends AsyncStreamEmitter<SocketEvent<TIncoming, TOutgoing, TPrivateOutgoing, TService>> {
	private readonly _transport: SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>;
	public readonly state: Partial<TState>;

	protected constructor(
		transport: SocketTransport<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>,
		options?: SocketOptions<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>
	) {
		super();

		this.state = options?.state || {};
		transport.socket = this;
		this._transport = transport;
	}

	public get id(): string {
		return this._transport.id;
	}

	public get authToken(): AuthToken {
		return this._transport.authToken;
	}

	public get signedAuthToken(): SignedAuthToken {
		return this._transport.signedAuthToken;
	}

	public deauthenticate(): Promise<boolean> {
		return this._transport.changeToUnauthenticatedState();
	}

	public disconnect(code=1000, reason?: string): void {
		this._transport.disconnect(code, reason);
	}

	public getBackpressure(): number {
		return Math.max(
			this._transport.getBackpressure(),
			this.getListenerBackpressure(),
			//this.receiver.getBackpressure(),
			//this.procedure.getBackpressure()
		);
	}

	public getInboundBackpressure(): number {
		return this._transport.getInboundBackpressure();
	}

	public getOutboundBackpressure(): number {
		return this._transport.getOutboundBackpressure();
	}

	emit(event: 'authStateChange', data: AuthStateChangeEvent): void;
	emit(event: 'authenticate', data: AuthenticateEvent): void;
	emit(event: 'badAuthToken', data: BadAuthTokenEvent): void;
	emit(event: 'close', data: CloseEvent): void;
	emit(event: 'connect', data: ConnectEvent): void;
	emit(event: 'connectAbort', data: DisconnectEvent): void;
	emit(event: 'connecting', data: ConnectingEvent): void;
	emit(event: 'deauthenticate', data: DeauthenticateEvent): void;
	emit(event: 'disconnect', data: DisconnectEvent): void;
	emit(event: 'end'): void;
	emit(event: 'error', data: ErrorEvent): void;
	emit(event: 'message', data: MessageEvent): void;
	emit(event: 'ping', data: PingEvent): void;
	emit(event: 'pong', data: PongEvent): void;
	emit(event: 'removeAuthToken', data: RemoveAuthTokenEvent): void;
	emit(event: 'request', data: RequestEvent<TIncoming, TService>): void;
	emit(event: 'response', data: ResponseEvent<TOutgoing, TPrivateOutgoing, TService>): void;
	emit(event: string, data?: SocketEvent<TIncoming, TOutgoing, TPrivateOutgoing, TService>): void {
		super.emit(event, data);
	}
	
	listen(): DemuxedConsumableStream<StreamEvent<SocketEvent<TIncoming, TOutgoing, TPrivateOutgoing, TService>>>;
	listen(event: 'authStateChange'): DemuxedConsumableStream<AuthStateChangeEvent>;
	listen(event: 'authenticate'): DemuxedConsumableStream<AuthenticateEvent>;
	listen(event: 'badAuthToken'): DemuxedConsumableStream<BadAuthTokenEvent>;
	listen(event: 'close'): DemuxedConsumableStream<CloseEvent>;
	listen(event: 'connect'): DemuxedConsumableStream<ConnectEvent>;
	listen(event: 'connectAbort'): DemuxedConsumableStream<DisconnectEvent>;
	listen(event: 'connecting'): DemuxedConsumableStream<ConnectingEvent>;
	listen(event: 'deauthenticate'): DemuxedConsumableStream<AuthenticateEvent>;
	listen(event: 'disconnect'): DemuxedConsumableStream<DisconnectEvent>;
	listen(event: 'end'): DemuxedConsumableStream<void>;
	listen(event: 'error'): DemuxedConsumableStream<ErrorEvent>;
	listen(event: 'message'): DemuxedConsumableStream<MessageEvent>;
	listen(event: 'ping'): DemuxedConsumableStream<PingEvent>;
	listen(event: 'pong'): DemuxedConsumableStream<PongEvent>;
	listen(event: 'removeAuthToken'): DemuxedConsumableStream<RemoveAuthTokenEvent>;
	listen(event: 'request'): DemuxedConsumableStream<RequestEvent<TIncoming, TService>>;
	listen(event: 'response'): DemuxedConsumableStream<ResponseEvent<TOutgoing, TPrivateOutgoing, TService>>;
	listen<U extends SocketEvent<TIncoming, TOutgoing, TPrivateOutgoing, TService>, V = U>(event: string): DemuxedConsumableStream<V>;
	listen<U extends SocketEvent<TIncoming, TOutgoing, TPrivateOutgoing, TService>, V = U>(event?: string): DemuxedConsumableStream<V> {
		return super.listen(event);
	}

	public get status(): SocketStatus {
		return this._transport.status;
	}

	public get url(): string {
		return this._transport.url;
	}

	public transmit<TMethod extends keyof TOutgoing>(
		method: TMethod, arg?: Parameters<TOutgoing[TMethod]>[0]): Promise<void>;
	public transmit<TServiceName extends keyof TService, TMethod extends keyof TService[TServiceName]>(
		options: [TServiceName, TMethod], arg?: Parameters<TService[TServiceName][TMethod]>[0]): Promise<void>;
	public transmit<TServiceName extends keyof TService, TServiceMethod extends keyof TService[TServiceName], TMethod extends keyof TOutgoing>(
		serviceAndMethod: TMethod | [TServiceName, TServiceMethod],
		arg?: (Parameters<TOutgoing[TMethod] | TService[TServiceName][TServiceMethod]>)[0]): Promise<void> {

		return this._transport.transmit(serviceAndMethod as TMethod, arg);
	}

	public invoke<TMethod extends keyof TOutgoing>(
		method: TMethod, arg?: Parameters<TOutgoing[TMethod]>[0]): Promise<FunctionReturnType<TOutgoing[TMethod]>>;
	public invoke<TServiceName extends keyof TService, TMethod extends keyof TService[TServiceName]>(
		options: [TServiceName, TMethod, (number | false)?], arg?: Parameters<TService[TServiceName][TMethod]>[0]): Promise<FunctionReturnType<TService[TServiceName][TMethod]>>;
	public invoke<TServiceName extends keyof TService, TMethod extends keyof TService[TServiceName]>(
		options: InvokeServiceOptions<TService, TServiceName, TMethod>, arg?: Parameters<TService[TServiceName][TMethod]>[0]): Promise<FunctionReturnType<TService[TServiceName][TMethod]>>;
	public invoke<TMethod extends keyof TOutgoing>(
		options: InvokeMethodOptions<TOutgoing, TMethod>, arg?: Parameters<TOutgoing[TMethod]>[0]): Promise<FunctionReturnType<TOutgoing[TMethod]>>;
	public invoke<TServiceName extends keyof TService, TServiceMethod extends keyof TService[TServiceName], TMethod extends keyof TOutgoing> (
		methodOptions: TMethod | [TServiceName, TServiceMethod, (number | false)?] | InvokeServiceOptions<TService, TServiceName, TServiceMethod> | InvokeMethodOptions<TOutgoing, TMethod>,
		arg?: Parameters<TOutgoing[TMethod] | TService[TServiceName][TServiceMethod]>[0]): Promise<FunctionReturnType<TService[TServiceName][TServiceMethod] | TOutgoing[TMethod]>> {

		return this._transport.invoke(methodOptions as TMethod, arg)[0];
	}
}