import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from './maps/method-map.js';

export type AnyResponse<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> =
	ErrorResponse | MethodDataResponse<TOutgoing> | MethodDataResponse<TPrivateOutgoing> | Response | ServiceDataResponse<TService>;

export interface DataResponse<T> extends Response {
	data: T
}

export interface ErrorResponse extends Response {
	error: Error
}

export type MethodDataResponse<TMethodMap extends MethodMap> =
	{ [TMethod in keyof TMethodMap]:
		DataResponse<ReturnType<TMethodMap[TMethod]>>
	}[keyof TMethodMap];

export interface Response {
	rid: number,
	timeoutAt?: Date
}

export type ServiceDataResponse<TServiceMap extends ServiceMap> =
	{ [TService in keyof TServiceMap]:
		{ [TMethod in keyof TServiceMap[TService]]:
			DataResponse<ReturnType<TServiceMap[TService][TMethod]>>
		}[keyof TServiceMap[TService]]
	}[keyof TServiceMap];

export function isResponsePacket<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
>(packet?: unknown): packet is AnyResponse<TOutgoing, TPrivateOutgoing, TService> {
	return (
		packet !== null
		&& typeof packet === 'object'
		&& 'rid' in packet
	);
}
