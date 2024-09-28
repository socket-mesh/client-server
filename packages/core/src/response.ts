import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./maps/method-map.js";

export type AnyResponse<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> =
	Response | ErrorResponse | ServiceDataResponse<TService> | MethodDataResponse<TPrivateOutgoing> | MethodDataResponse<TOutgoing>;

export function isResponsePacket<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
>(packet?: unknown): packet is AnyResponse<TOutgoing, TPrivateOutgoing, TService> {
	return (typeof packet === 'object') && 'rid' in packet;
}

export type ServiceDataResponse<TServiceMap extends ServiceMap> =
	{ [TService in keyof TServiceMap]:
		{ [TMethod in keyof TServiceMap[TService]]:
			DataResponse<ReturnType<TServiceMap[TService][TMethod]>>
		}[keyof TServiceMap[TService]]
	}[keyof TServiceMap]

export type MethodDataResponse<TMethodMap extends MethodMap> =
	{ [TMethod in keyof TMethodMap]: 
		DataResponse<ReturnType<TMethodMap[TMethod]>>
	}[keyof TMethodMap]

export interface Response {
	rid: number,
	timeoutAt?: Date
}

export interface ErrorResponse extends Response {
	error: Error
}

export interface DataResponse<T> extends Response {
	data: T
}