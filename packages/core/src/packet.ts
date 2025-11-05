import { MethodMap, ServiceMap } from './maps/method-map.js';

export type AnyPacket<
	TIncoming extends MethodMap,
	TService extends ServiceMap
> = MethodPacket<TIncoming> | ServicePacket<TService>;

export type MethodPacket<TMethodMap extends MethodMap> =
	{ [TMethod in keyof TMethodMap]:
		MethodRequestPacket<TMethodMap, TMethod>
	}[keyof TMethodMap];

export interface MethodRequestPacket<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> extends RequestPacket {
	ackTimeoutMs?: boolean | number,
	data: Parameters<TMethodMap[TMethod]>[0],
	method: TMethod
}

interface RequestPacket {
	cid?: number
}

export type ServicePacket<TServiceMap extends ServiceMap> =
	{ [TService in keyof TServiceMap]:
		{ [TMethod in keyof TServiceMap[TService]]:
			ServiceRequestPacket<TServiceMap, TService, TMethod>
		}[keyof TServiceMap[TService]]
	}[keyof TServiceMap];

export interface ServiceRequestPacket<
	TServiceMap extends ServiceMap,
	TService extends keyof TServiceMap,
	TMethod extends keyof TServiceMap[TService]
> extends RequestPacket {
	ackTimeoutMs?: boolean | number,
	data?: Parameters<TServiceMap[TService][TMethod]>[0],
	method: TMethod,
	service: TService
}

export function isRequestPacket<
	TIncoming extends MethodMap,
	TService extends ServiceMap
>(packet: unknown): packet is AnyPacket<TIncoming, TService> {
	return (
		packet !== null
		&& typeof packet === 'object'
		&& 'method' in packet
	);
}
