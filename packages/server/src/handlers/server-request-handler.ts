import { ClientPrivateMap, ServerPrivateMap } from "@socket-mesh/client";
import { PrivateMethodMap, PublicMethodMap, RequestHandlerArgs, ServiceMap } from "@socket-mesh/core"
import { ServerSocketState } from "../server-socket-state.js";
import { ServerSocket } from "../server-socket.js";
import { ServerTransport } from "../server-transport.js";
import { ChannelMap } from "@socket-mesh/channels";

export type ServerRequestHandlerArgs<
	TOptions,
	TIncoming extends PublicMethodMap = {},
	TChannel extends ChannelMap = {},
	TService extends ServiceMap = {},
	TOutgoing extends PublicMethodMap = {},
	TPrivateIncoming extends PrivateMethodMap = {},
	TPrivateOutgoing extends PrivateMethodMap = {},
	TServerState extends object = {},
	TState extends object = {}
> =
	RequestHandlerArgs<
		TOptions,
		TIncoming & TPrivateIncoming & ServerPrivateMap,
		TOutgoing,
		TPrivateOutgoing & ClientPrivateMap,
		TService,
		TState & ServerSocketState,
		ServerSocket<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>,
		ServerTransport<TIncoming, TChannel, TService, TOutgoing, TPrivateIncoming, TPrivateOutgoing, TServerState, TState>
	>;