import ws from "isomorphic-ws";
import { MethodMap, PublicMethodMap, ServiceMap } from "./maps/method-map";
import { SocketOptions } from "../socket.js";
import { ClientAuthEngine, LocalStorageAuthEngineOptions } from "./client-auth-engine";
import { ServerPrivateMap } from "./maps/server-private-map";

export interface AutoReconnectOptions {
	initialDelay: number,
	randomness: number,
	multiplier: number,
	maxDelayMs: number
}

export interface ConnectOptions {
	address?: string | URL,
	timeoutMs?: number,
	wsOptions?: ws.ClientOptions
}

export interface ClientSocketOptions<
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap & ServerPrivateMap>,
	TServiceMap extends ServiceMap<TServiceMap> = {},
	TSocketState extends object = {},
	TIncomingMap extends MethodMap<TIncomingMap> = {},
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> = {}
> extends SocketOptions<TIncomingMap, TServiceMap, TOutgoingMap, TPrivateOutgoingMap & ServerPrivateMap, TSocketState>, ConnectOptions {
	// Whether or not to automatically connect the socket as soon as it is created. Default is true.
	autoConnect?: boolean,

	// A custom engine to use for storing and loading JWT auth tokens on the client side.
	authEngine?: ClientAuthEngine | LocalStorageAuthEngineOptions | null;

	// Whether or not to automatically reconnect the socket when it loses the connection. Default is true.
	// Valid properties are: initialDelay (milliseconds), randomness (milliseconds), multiplier (decimal; default is 1.5) and maxDelay (milliseconds).
	autoReconnect?: Partial<AutoReconnectOptions> | boolean

	// This is true by default. If you set this to false, then the socket will not automatically try to subscribe to pending subscriptions on
	// connect - Instead, you will have to manually invoke the processSubscriptions callback from inside the 'connect' event handler on the client side.
	// See AGClientSocket API. This gives you more fine-grained control with regards to when pending subscriptions are processed after the socket
	// connection is established (or re-established).
	autoSubscribeOnConnect?: boolean,

	// A prefix to add to the channel names.
	channelPrefix?: string;

	// (milliseconds)
	connectTimeoutMs?: number;
	
	isPingTimeoutDisabled?: boolean;
}

export function parseClientOptions<
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap & ServerPrivateMap>,
	TServiceMap extends ServiceMap<TServiceMap>,
	TSocketState extends object,
	TIncomingMap extends MethodMap<TIncomingMap>,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap>
>(options: ClientSocketOptions<TOutgoingMap, TServiceMap, TSocketState, TIncomingMap, TPrivateOutgoingMap> | string | URL):
	ClientSocketOptions<
		TOutgoingMap,
		TServiceMap,
		TSocketState,
		TIncomingMap,
		TPrivateOutgoingMap
	> {
	if (typeof options === 'string' || 'pathname' in options) {
		options = { address: options } as ClientSocketOptions<TOutgoingMap, TServiceMap, TSocketState, TIncomingMap, TPrivateOutgoingMap>;
	}
	
	return options;
}