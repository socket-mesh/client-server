import { ServerSocketState } from "../../server/server-socket-state.js";
import { ChannelMap } from "../../channels/channel-map.js";
import { ClientMap, ClientPrivateMap } from "./client-map.js";
import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./method-map.js";
import { BasicServerMap, ServerMap, ServerPrivateMap } from "./server-map.js";

export interface SocketMap {
	Incoming: MethodMap,
	Service: ServiceMap,
	Outgoing: PublicMethodMap,
	PrivateOutgoing: PrivateMethodMap,
	State: object
}

export interface EmptySocketMap {
	Incoming: {},
	Service: {},
	Outgoing: {},
	PrivateOutgoing: {},
	State: {}
}

export interface SocketMapFromClient<T extends ClientMap> {
	Incoming: T['Incoming'] & ClientPrivateMap,
	Service: T['Service'],
	Outgoing: T['Outgoing'],
	PrivateOutgoing: T['PrivateOutgoing'] & ServerPrivateMap,
	State: T['State']
}

export interface SocketMapFromServer<T extends ServerMap> {
	Incoming: T['Incoming'] & T['PrivateIncoming'] & ServerPrivateMap,
	Service: T['Service'],
	Outgoing: T['Outgoing'],
	PrivateOutgoing: T['PrivateOutgoing'] & ClientPrivateMap,
	State: T['State'] & ServerSocketState<T>
}

export interface SocketMapClientFromServer<T extends ServerMap> {
	Incoming: T['Outgoing'] & T['PrivateOutgoing'] & ServerPrivateMap,
	Service: T['Service'],
	Outgoing: T['Incoming'],
	PrivateOutgoing: T['PrivateIncoming'] & ClientPrivateMap,
	State: T['State'] & ServerSocketState<T>
}

export interface BasicSocketMapServer<TIncoming extends PublicMethodMap = {}, TChannels extends ChannelMap = {}, TState extends object = {}> {
	Incoming: TIncoming & ServerPrivateMap,
	Service: {},
	Outgoing: {},
	PrivateOutgoing: ClientPrivateMap,
	State: TState & ServerSocketState<BasicServerMap<TIncoming, TChannels, TState>>
}

export interface BasicSocketMapClient<TOutgoing extends PublicMethodMap = {}, TState extends object = {}> {
	Incoming: ClientPrivateMap,
	Service: {},
	Outgoing: TOutgoing,
	PrivateOutgoing: ServerPrivateMap,
	State: TState
}