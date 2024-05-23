import { MethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map.js";
import { Server } from "./server.js";
import { ChannelMap } from "../client/channels/channel-map.js";

export interface ServerSocketState<
	TIncomingMap extends PublicMethodMap<TIncomingMap, TPrivateIncomingMap> = {},
	TChannelMap extends ChannelMap<TChannelMap> = {},
	TServiceMap extends ServiceMap<TServiceMap> = {},
	TOutgoingMap extends PublicMethodMap<TOutgoingMap, TPrivateOutgoingMap> = {},
	TPrivateIncomingMap extends MethodMap<TPrivateIncomingMap> = {},
	TPrivateOutgoingMap extends MethodMap<TPrivateOutgoingMap> = {},
	TServerState extends object = {}
> {
	server: Server<TIncomingMap, TServerState, TChannelMap, TServiceMap, TOutgoingMap, TPrivateIncomingMap, TPrivateOutgoingMap, this>
}
