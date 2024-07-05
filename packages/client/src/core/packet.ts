import { MethodMap, ServiceMap } from "../maps/method-map.js";
import { SocketMap } from "../maps/socket-map.js";

export type AnyPacket<T extends SocketMap> = ServicePacket<T['Service']> | MethodPacket<T['Incoming']>;

export type ServicePacket<TServiceMap extends ServiceMap> =
	{ [TService in keyof TServiceMap]:
		{ [TMethod in keyof TServiceMap[TService]]:
			ServiceRequestPacket<TServiceMap, TService, TMethod>
		}[keyof TServiceMap[TService]]
	}[keyof TServiceMap]

interface RequestPacket {
	cid?: number
}

export type MethodPacket<TMethodMap extends MethodMap> =
	{ [TMethod in keyof TMethodMap]: 
		MethodRequestPacket<TMethodMap, TMethod>
	}[keyof TMethodMap]

export interface ServiceRequestPacket<
	TServiceMap extends ServiceMap,
	TService extends keyof TServiceMap,
	TMethod extends keyof TServiceMap[TService]
> extends RequestPacket {
	service: TService,
	method: TMethod,
	ackTimeoutMs?: number | boolean,
	data?: Parameters<TServiceMap[TService][TMethod]>[0]
}

export interface MethodRequestPacket<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> extends RequestPacket {
	method: TMethod,
	data: Parameters<TMethodMap[TMethod]>[0],
	ackTimeoutMs?: number | boolean
}

export function isRequestPacket<T extends SocketMap>(packet: unknown): packet is AnyPacket<T> {
	return (typeof packet === 'object') && 'method' in packet;
}