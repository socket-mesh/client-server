import { CodecEngine } from "@socket-mesh/formatter";
import { AnyPacket } from "./request";
import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";
import { SocketEvent, AuthenticateEvent, BadAuthTokenEvent, CloseEvent, ConnectEvent, DisconnectEvent, ErrorEvent, MessageEvent, PingEvent, PongEvent, RequestEvent, UnexpectedResponseEvent, UpgradeEvent, ResponseEvent, AuthStateChangeEvent, RemoveAuthTokenEvent, ConnectingEvent, DeauthenticateEvent } from "./socket-event.js";
import { FunctionReturnType, MethodMap, ServiceMap } from "./client/maps/method-map.js";
import { HandlerMap } from "./client/maps/handler-map.js";
import { SocketTransport } from "./socket-transport.js";
import { DemuxedConsumableStream, StreamEvent } from "@socket-mesh/stream-demux";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { SocketMap } from "./client/maps/socket-map.js";
import { Middleware } from "./middleware/middleware";

export type CallIdGenerator = () => number;

export type StreamCleanupMode = 'kill' | 'close' | 'none';

export interface SocketOptions<T extends SocketMap, TSocket extends Socket<T> = Socket<T>> {
	ackTimeoutMs?: number,
	callIdGenerator?: CallIdGenerator,
	codecEngine?: CodecEngine,
	handlers?: HandlerMap<T>;
	id?: string,
	isPingTimeoutDisabled?: boolean;
	middleware?: Middleware<T>[],
	onUnhandledRequest?: (socket: TSocket, packet: AnyPacket<T['Service'], T['Incoming']>) => boolean,
	state?: T['State'],

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

export type SocketStatus = 'connecting' | 'open' | 'closing' | 'closed';

export interface InvokeMethodOptions<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> {
	method: TMethod,
	ackTimeoutMs?: number | false
}

export interface InvokeServiceOptions<TServiceMap extends ServiceMap, TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]> {
	service: TService,
	method: TMethod,
	ackTimeoutMs?: number | false
}

export class Socket<T extends SocketMap> extends AsyncStreamEmitter<SocketEvent<T>> {
	private readonly _transport: SocketTransport<T>;

	protected constructor(transport: SocketTransport<T>) {
		super();

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

	public ping(): Promise<void> {
		return this._transport.ping();
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
	emit(event: 'request', data: RequestEvent<T['Service'], T['Incoming']>): void;
	emit(event: 'response', data: ResponseEvent<T['Service'], T['Outgoing'], T['PrivateOutgoing']>): void;
	emit(event: 'unexpectedResponse', data: UnexpectedResponseEvent): void;
	emit(event: 'upgrade', data: UpgradeEvent): void;
	emit(event: string, data?: SocketEvent<T>): void {
		super.emit(event, data);
	}
	
	listen(): DemuxedConsumableStream<StreamEvent<SocketEvent<T>>>;
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
	listen(event: 'request'): DemuxedConsumableStream<RequestEvent<T['Service'], T['Incoming']>>;
	listen(event: 'response'): DemuxedConsumableStream<ResponseEvent<T['Service'], T['Outgoing'], T['PrivateOutgoing']>>;
	listen(event: 'unexpectedResponse'): DemuxedConsumableStream<UnexpectedResponseEvent>;
	listen(event: 'upgrade'): DemuxedConsumableStream<UpgradeEvent>;
	listen<U extends SocketEvent<T>, V = U>(event: string): DemuxedConsumableStream<V>;
	listen<U extends SocketEvent<T>, V = U>(event?: string): DemuxedConsumableStream<V> {
		return super.listen(event);
	}

	public get url(): string {
		return this._transport.url;
	}

	public get status(): SocketStatus {
		return this._transport.status;
	}

	public transmit<TMethod extends keyof T['Outgoing']>(
		method: TMethod, arg?: Parameters<T['Outgoing'][TMethod]>[0]): Promise<void>;
	public transmit<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: [TService, TMethod], arg?: Parameters<T['Service'][TService][TMethod]>[0]): Promise<void>;
	public transmit<TService extends keyof T['Service'], TServiceMethod extends keyof T['Service'][TService], TMethod extends keyof T['Outgoing']>(
		serviceAndMethod: TMethod | [TService, TServiceMethod],
		arg?: (Parameters<T['Outgoing'][TMethod] | T['Service'][TService][TServiceMethod]>)[0]): Promise<void> {

		return this._transport.transmit(serviceAndMethod as TMethod, arg);
	}

	public invoke<TMethod extends keyof T['Outgoing']>(
		method: TMethod, arg?: Parameters<T['Outgoing'][TMethod]>[0]): Promise<FunctionReturnType<T['Outgoing'][TMethod]>>;
	public invoke<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: [TService, TMethod, (number | false)?], arg?: Parameters<T['Service'][TService][TMethod]>[0]): Promise<FunctionReturnType<T['Service'][TService][TMethod]>>;
	public invoke<TService extends keyof T['Service'], TMethod extends keyof T['Service'][TService]>(
		options: InvokeServiceOptions<T['Service'], TService, TMethod>, arg?: Parameters<T['Service'][TService][TMethod]>[0]): Promise<FunctionReturnType<T['Service'][TService][TMethod]>>;
	public invoke<TMethod extends keyof T['Outgoing']>(
		options: InvokeMethodOptions<T['Outgoing'], TMethod>, arg?: Parameters<T['Outgoing'][TMethod]>[0]): Promise<FunctionReturnType<T['Outgoing'][TMethod]>>;
	public invoke<TService extends keyof T['Service'], TServiceMethod extends keyof T['Service'][TService], TMethod extends keyof T['Outgoing']> (
		methodOptions: TMethod | [TService, TServiceMethod, (number | false)?] | InvokeServiceOptions<T['Service'], TService, TServiceMethod> | InvokeMethodOptions<T['Outgoing'], TMethod>,
		arg?: Parameters<T['Outgoing'][TMethod] | T['Service'][TService][TServiceMethod]>[0]): Promise<FunctionReturnType<T['Service'][TService][TServiceMethod] | T['Outgoing'][TMethod]>> {

		return this._transport.invoke(methodOptions as TMethod, arg)[0];
	}
}