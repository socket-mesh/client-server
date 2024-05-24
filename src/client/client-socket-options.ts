import ws from "isomorphic-ws";
import { SocketOptions } from "../socket.js";
import { ClientAuthEngine, LocalStorageAuthEngineOptions } from "./client-auth-engine";
import { SocketMapFromClient, SocketMap } from "./maps/socket-map";

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

export interface ClientSocketOptions<T extends SocketMap> extends SocketOptions<SocketMapFromClient<T>>, ConnectOptions {
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

export function parseClientOptions<T extends SocketMap>(options: ClientSocketOptions<T> | string | URL):
	ClientSocketOptions<T> {
	if (typeof options === 'string' || 'pathname' in options) {
		options = { address: options } as ClientSocketOptions<T>;
	}
	
	return options;
}