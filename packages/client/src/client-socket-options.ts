import ws from "isomorphic-ws";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap, SocketOptions } from "@socket-mesh/core";
import { ClientAuthEngine, LocalStorageAuthEngineOptions } from "./client-auth-engine.js";
import { ClientPrivateMap } from "./maps/client-map.js";
import { ServerPrivateMap } from "./maps/server-map.js";

export interface AutoReconnectOptions {
	initialDelay: number,
	randomness: number,
	multiplier: number,
	maxDelayMs: number
}

export interface ConnectOptions {
	address?: string | URL,
	connectTimeoutMs?: number
	wsOptions?: ws.ClientOptions
}

export interface ClientSocketOptions<
	TIncoming extends MethodMap = {},
	TService extends ServiceMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TState extends object = {}
> extends SocketOptions<
	TIncoming & ClientPrivateMap,
	TOutgoing,
	TPrivateOutgoing & ServerPrivateMap,
	TService,
	TState
>, ConnectOptions {
	// Whether or not to automatically connect the socket as soon as it is created. Default is true.
	autoConnect?: boolean,

	// A custom engine to use for storing and loading JWT auth tokens on the client side.
	authEngine?: ClientAuthEngine | LocalStorageAuthEngineOptions | null,

	// Whether or not to automatically reconnect the socket when it loses the connection. Default is true.
	// Valid properties are: initialDelay (milliseconds), randomness (milliseconds), multiplier (decimal; default is 1.5) and maxDelay (milliseconds).
	autoReconnect?: Partial<AutoReconnectOptions> | boolean,

	// This is true by default. If you set this to false, then the socket will not automatically try to subscribe to pending subscriptions on
	// connect - Instead, you will have to manually invoke the processSubscriptions callback from inside the 'connect' event handler on the client side.
	// See AGClientSocket API. This gives you more fine-grained control with regards to when pending subscriptions are processed after the socket
	// connection is established (or re-established).
	autoSubscribeOnConnect?: boolean,

	// A prefix to add to the channel names.
	channelPrefix?: string,
}

export function parseClientOptions<
	TIncoming extends MethodMap,
	TService extends ServiceMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TState extends object
>(options: ClientSocketOptions<TIncoming, TService, TOutgoing, TPrivateOutgoing, TState> | string | URL): ClientSocketOptions<TIncoming, TService, TOutgoing, TPrivateOutgoing, TState> {
	if (typeof options === 'string' || 'pathname' in options) {
		options = { address: options } as ClientSocketOptions<TIncoming, TService, TOutgoing, TPrivateOutgoing, TState>;
	}
	
	return Object.assign<ClientSocketOptions<TIncoming, TService, TOutgoing, TPrivateOutgoing, TState>, ClientSocketOptions<TIncoming, TService, TOutgoing, TPrivateOutgoing, TState>>({}, options);
}