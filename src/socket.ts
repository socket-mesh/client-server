import { CodecEngine } from "@socket-mesh/formatter";
import { AnyMiddleware } from "./middleware/middleware.js";
import { AnyPacket } from "./request";
import { AsyncStreamEmitter } from "@socket-mesh/async-stream-emitter";
import { SocketEvent, AuthenticationEvent, BadAuthTokenEvent, CloseEvent, ConnectEvent, DisconnectEvent, ErrorEvent, MessageEvent, PingEvent, PongEvent, RequestEvent, UnexpectedResponseEvent, UpgradeEvent, ResponseEvent, AuthStateChangeEvent, RemoveAuthTokenEvent, ConnectingEvent, SubscribeEvent, SubscribeStateChangeEvent, UnsubscribeEvent, SubscribeFailEvent } from "./socket-event.js";
import { PublicMethodMap, FunctionReturnType, MethodMap, ServiceMap } from "./client/maps/method-map.js";
import { HandlerMap } from "./client/maps/handler-map.js";
import { SocketTransport } from "./socket-transport.js";
import { DemuxedConsumableStream, StreamEvent } from "@socket-mesh/stream-demux";
import { AuthToken, SignedAuthToken } from "@socket-mesh/auth";

export type CallIdGenerator = () => number;

export interface SocketOptions<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object,
	TSocket extends Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState> = Socket<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>
> {
	ackTimeoutMs?: number,
	id?: string,
	callIdGenerator?: CallIdGenerator,
	handlers?: HandlerMap<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;
	onUnhandledRequest?: (socket: TSocket, packet: AnyPacket<TServiceMap, TIncomingMap>) => boolean,
	codecEngine?: CodecEngine,
	middleware?: AnyMiddleware<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>[],
	state?: TSocketState
}

export type SocketStatus = 'connecting' | 'open' | 'closing' | 'closed';

export interface InvokeMethodOptions<TMethodMap extends MethodMap<TMethodMap>, TMethod extends keyof TMethodMap> {
	method: TMethod,
	ackTimeoutMs?: number | false
}

export interface InvokeServiceOptions<TServiceMap extends ServiceMap<TServiceMap>, TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]> {
	service: TService,
	method: TMethod,
	ackTimeoutMs?: number | false
}

export class Socket<
	TIncomingMap extends MethodMap<TIncomingMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>,
	TSocketState extends object
> extends AsyncStreamEmitter<SocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>> {

	private readonly _transport: SocketTransport<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>;

	protected constructor(
		transport: SocketTransport<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap, TSocketState>
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
	emit(eventName: 'request', data: RequestEvent<TServiceMap, TIncomingMap>): void;
	emit(eventName: 'response', data: ResponseEvent<TServiceMap, TOutgoingMap, TPrivateOutgoingMap>): void;
	emit(eventName: 'subscribe', data: SubscribeEvent): void;
	emit(eventName: 'subscribeFail', data: SubscribeFailEvent): void;
	emit(eventName: 'subscribeRequest', data: SubscribeEvent): void;
	emit(eventName: 'subscribeStateChange', data: SubscribeStateChangeEvent): void;
	emit(eventName: 'unsubscribe', data: UnsubscribeEvent): void;
	emit(eventName: 'unexpectedResponse', data: UnexpectedResponseEvent): void;
	emit(eventName: 'upgrade', data: UpgradeEvent): void;
	emit(eventName: string, data: SocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>): void {
		super.emit(eventName, data);
	}
	
	listen(): DemuxedConsumableStream<StreamEvent<SocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>>>;
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
	listen(eventName: 'request'): DemuxedConsumableStream<RequestEvent<TServiceMap, TIncomingMap>>;
	listen(eventName: 'response'): DemuxedConsumableStream<ResponseEvent<TServiceMap, TOutgoingMap, TPrivateOutgoingMap>>;
	listen(eventName: 'subscribe'): DemuxedConsumableStream<SubscribeEvent>;
	listen(eventName: 'subscribeFail'): DemuxedConsumableStream<SubscribeFailEvent>;
	listen(eventName: 'subscribeRequest'): DemuxedConsumableStream<SubscribeEvent>;
	listen(eventName: 'subscribeStateChange'): DemuxedConsumableStream<SubscribeStateChangeEvent>;
	listen(eventName: 'unsubscribe'): DemuxedConsumableStream<UnsubscribeEvent>;
	listen(eventName: 'unexpectedResponse'): DemuxedConsumableStream<UnexpectedResponseEvent>;
	listen(eventName: 'upgrade'): DemuxedConsumableStream<UpgradeEvent>;
	listen<U extends SocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>, V = U>(eventName: string): DemuxedConsumableStream<V>;
	listen<U extends SocketEvent<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap>, V = U>(eventName?: string): DemuxedConsumableStream<V> {
		return super.listen(eventName);
	}

	public get url(): string {
		return this._transport.url;
	}

	public get status(): SocketStatus {
		return this._transport.status;
	}

	public transmit<TMethod extends keyof TOutgoingMap>(
		method: TMethod, arg?: Parameters<TOutgoingMap[TMethod]>[0]): Promise<void>;
	public transmit<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(
		options: [TService, TMethod], arg?: Parameters<TServiceMap[TService][TMethod]>[0]): Promise<void>;
	public transmit<TService extends keyof TServiceMap, TServiceMethod extends keyof TServiceMap[TService], TMethod extends keyof TOutgoingMap>(
		serviceAndMethod: TMethod | [TService, TServiceMethod],
		arg?: (Parameters<TOutgoingMap[TMethod] | TServiceMap[TService][TServiceMethod]>)[0]): Promise<void> {

		return this._transport.transmit(serviceAndMethod as TMethod, arg);
	}

	public invoke<TMethod extends keyof TOutgoingMap>(
		method: TMethod, arg?: Parameters<TOutgoingMap[TMethod]>[0]): Promise<FunctionReturnType<TOutgoingMap[TMethod]>>;
	public invoke<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(
		options: [TService, TMethod, (number | false)?], arg?: Parameters<TServiceMap[TService][TMethod]>[0]): Promise<FunctionReturnType<TServiceMap[TService][TMethod]>>;
	public invoke<TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]>(
		options: InvokeServiceOptions<TServiceMap, TService, TMethod>, arg?: Parameters<TServiceMap[TService][TMethod]>[0]): Promise<FunctionReturnType<TServiceMap[TService][TMethod]>>;
	public invoke<TMethod extends keyof TOutgoingMap>(
		options: InvokeMethodOptions<TOutgoingMap, TMethod>, arg?: Parameters<TOutgoingMap[TMethod]>[0]): Promise<FunctionReturnType<TOutgoingMap[TMethod]>>;
	public invoke<TService extends keyof TServiceMap, TServiceMethod extends keyof TServiceMap[TService], TMethod extends keyof TOutgoingMap> (
		methodOptions: TMethod | [TService, TServiceMethod, (number | false)?] | InvokeServiceOptions<TServiceMap, TService, TServiceMethod> | InvokeMethodOptions<TOutgoingMap, TMethod>,
		arg?: Parameters<TOutgoingMap[TMethod] | TServiceMap[TService][TServiceMethod]>[0]): Promise<FunctionReturnType<TServiceMap[TService][TServiceMethod] | TOutgoingMap[TMethod]>> {

		return this._transport.invoke(methodOptions as TMethod, arg);
	}
}