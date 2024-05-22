import { MethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map.js";
import { Server } from "./server.js";
import { ServerPrivateMap } from "../client/maps/server-private-map.js";
import { ClientPrivateMap } from "../client/maps/client-private-map.js";
import { ChannelMap } from "../client/channels/channel-map.js";

export interface ServerSocketState<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap> = {},
	TChannelMap extends ChannelMap<TChannelMap> = {},
	TServiceMap extends ServiceMap<TServiceMap> = {},
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap> = {},
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap> & ServerPrivateMap = ServerPrivateMap,
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> & ClientPrivateMap = ClientPrivateMap,
	TServerState extends object = {}
> {
	server: Server<TIncomingMap, TServerState, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, this>
}
