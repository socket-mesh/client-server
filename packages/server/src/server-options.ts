import ws from "ws";
import { AuthEngine, AuthOptions } from "@socket-mesh/auth-engine";
import { CallIdGenerator, HandlerMap, StreamCleanupMode, ServiceMap, PublicMethodMap, PrivateMethodMap } from "@socket-mesh/core";
import { CodecEngine } from "@socket-mesh/formatter";
import { ServerPlugin } from "./plugin/server-plugin.js";
import { Broker } from "./broker/broker.js";
import { ChannelMap } from "@socket-mesh/channels";
import { ClientPrivateMap, ServerPrivateMap } from "@socket-mesh/client";

export interface ServerOptions<
	TIncoming extends PublicMethodMap = {},
	TChannel extends ChannelMap = {},
	TService extends ServiceMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateIncoming extends PrivateMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TServerState extends object = {},
	TState extends object = {}
> extends ws.ServerOptions {
	// In milliseconds, the timeout for receiving a response
	// when using invoke() or invokePublish().
	ackTimeoutMs?: number,

	// Whether or not clients are allowed to publish messages to channels.
	allowClientPublish?: boolean,

	authEngine?: AuthEngine | AuthOptions,

	brokerEngine?: Broker<TChannel>,

	callIdGenerator?: CallIdGenerator,

	codecEngine?: CodecEngine,

	// In milliseconds, the timeout for receiving a response
	// when using invoke() or invokePublish().	ackTimeout: number
	handshakeTimeoutMs?: number,

	handlers?: HandlerMap<TIncoming & TPrivateIncoming & ServerPrivateMap, TOutgoing, TPrivateOutgoing & ClientPrivateMap, TService, TState>;

	isPingTimeoutDisabled?: boolean,

	plugins?: ServerPlugin<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>[],

	// Origins which are allowed to connect to the server.
	origins?: string;

	// The interval in milliseconds on which to send a ping to the client to check that
	// it is still alive.
	pingIntervalMs?: number,

	pingTimeoutMs?: number,

	// The maximum number of unique channels which a single socket can subscribe to.
	socketChannelLimit?: number,

	// Lets you specify the default cleanup behaviour for
	// when a socket becomes disconnected.
	// Can be either 'kill' or 'close'. Kill mode means
	// that all of the socket's streams will be killed and
	// so consumption will stop immediately.
	// Close mode means that consumers on the socket will
	// be able to finish processing their stream backlogs
	// bebfore they are ended.
	socketStreamCleanupMode?: StreamCleanupMode,

	strictHandshake?: boolean
}
