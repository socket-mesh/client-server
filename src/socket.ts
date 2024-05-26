import { CodecEngine } from "@socket-mesh/formatter";
import { AnyMiddleware } from "./middleware/middleware.js";
import { AnyPacket } from "./request";
import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";
import { SocketEvent, AuthenticationEvent, BadAuthTokenEvent, CloseEvent, ConnectEvent, DisconnectEvent, ErrorEvent, MessageEvent, PingEvent, PongEvent, RequestEvent, UnexpectedResponseEvent, UpgradeEvent, ResponseEvent, AuthStateChangeEvent, RemoveAuthTokenEvent, ConnectingEvent } from "./socket-event.js";
import { FunctionReturnType, MethodMap, ServiceMap } from "./client/maps/method-map.js";
import { HandlerMap } from "./client/maps/handler-map.js";
import { SocketTransport } from "./socket-transport.js";
import { DemuxedConsumableStream, StreamEvent } from "@socket-mesh/stream-demux";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";
import { SocketMap } from "./client/maps/socket-map.js";

export type CallIdGenerator = () => number;

export interface SocketOptions<T extends SocketMap, TSocket extends Socket<T> = Socket<T>> {
	ackTimeoutMs?: number,
	id?: string,
	callIdGenerator?: CallIdGenerator,
	handlers?: HandlerMap<T>;
	onUnhandledRequest?: (socket: TSocket, packet: AnyPacket<T['Service'], T['Incoming']>) => boolean,
	codecEngine?: CodecEngine,
	middleware?: AnyMiddleware<T>[],
	state?: T['State']
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

	protected constructor(
		transport: SocketTransport<T>
	) {
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

	public disconnect(code=1000, reason?: string): void {
		this._transport.disconnect(code, reason);
	}

	public ping(): Promise<void> {
		return this._transport.ping();
	}

	emit(eventName: 'authStateChange', data: AuthStateChangeEvent): void;
	emit(eventName: 'authenticate', data: AuthenticationEvent): void;
	emit(eventName: 'badAuthToken', data: BadAuthTokenEvent): void;
	emit(eventName: 'close', data: CloseEvent): void;
	emit(eventName: 'connect', data: ConnectEvent): void;
	emit(eventName: 'connectAbort', data: DisconnectEvent): void;
	emit(eventName: 'connecting', data: ConnectingEvent): void;
	emit(eventName: 'deauthenticate', data: AuthenticationEvent): void;
	emit(eventName: 'disconnect', data: DisconnectEvent): void;
	emit(eventName: 'error', data: ErrorEvent): void;
	emit(eventName: 'message', data: MessageEvent): void;
	emit(eventName: 'ping', data: PingEvent): void;
	emit(eventName: 'pong', data: PongEvent): void;
	emit(eventName: 'removeAuthToken', data: RemoveAuthTokenEvent): void;
	emit(eventName: 'request', data: RequestEvent<T['Service'], T['Incoming']>): void;
	emit(eventName: 'response', data: ResponseEvent<T['Service'], T['Outgoing'], T['PrivateOutgoing']>): void;
	emit(eventName: 'unexpectedResponse', data: UnexpectedResponseEvent): void;
	emit(eventName: 'upgrade', data: UpgradeEvent): void;
	emit(eventName: string, data: SocketEvent<T>): void {
		super.emit(eventName, data);
	}
	
	listen(): DemuxedConsumableStream<StreamEvent<SocketEvent<T>>>;
	listen(eventName: 'authStateChange'): DemuxedConsumableStream<AuthStateChangeEvent>;
	listen(eventName: 'authenticate'): DemuxedConsumableStream<AuthenticationEvent>;
	listen(eventName: 'badAuthToken'): DemuxedConsumableStream<BadAuthTokenEvent>;
	listen(eventName: 'close'): DemuxedConsumableStream<CloseEvent>;
	listen(eventName: 'connect'): DemuxedConsumableStream<ConnectEvent>;
	listen(eventName: 'connectAbort'): DemuxedConsumableStream<DisconnectEvent>;
	listen(eventName: 'connecting'): DemuxedConsumableStream<ConnectingEvent>;
	listen(eventName: 'deauthenticate'): DemuxedConsumableStream<AuthenticationEvent>;
	listen(eventName: 'disconnect'): DemuxedConsumableStream<DisconnectEvent>;
	listen(eventName: 'error'): DemuxedConsumableStream<ErrorEvent>;
	listen(eventName: 'message'): DemuxedConsumableStream<MessageEvent>;
	listen(eventName: 'ping'): DemuxedConsumableStream<PingEvent>;
	listen(eventName: 'pong'): DemuxedConsumableStream<PongEvent>;
	listen(eventName: 'removeAuthToken'): DemuxedConsumableStream<RemoveAuthTokenEvent>;
	listen(eventName: 'request'): DemuxedConsumableStream<RequestEvent<T['Service'], T['Incoming']>>;
	listen(eventName: 'response'): DemuxedConsumableStream<ResponseEvent<T['Service'], T['Outgoing'], T['PrivateOutgoing']>>;
	listen(eventName: 'unexpectedResponse'): DemuxedConsumableStream<UnexpectedResponseEvent>;
	listen(eventName: 'upgrade'): DemuxedConsumableStream<UpgradeEvent>;
	listen<U extends SocketEvent<T>, V = U>(eventName: string): DemuxedConsumableStream<V>;
	listen<U extends SocketEvent<T>, V = U>(eventName?: string): DemuxedConsumableStream<V> {
		return super.listen(eventName);
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