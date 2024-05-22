import { MethodMap, PublicMethodMap, ServiceMap } from "./client/maps/method-map";

export type AnyResponse<
	TServiceMap extends ServiceMap<TServiceMap>,
	TMethodMap extends PublicMethodMap<TMethodMap, TPrivateMap>,
	TPrivateMap extends MethodMap<TPrivateMap> = {}
> = Response | ErrorResponse | ServiceDataResponse<TServiceMap> | MethodDataResponse<TPrivateMap> | MethodDataResponse<TMethodMap>;

export type ServiceDataResponse<TServiceMap extends ServiceMap<TServiceMap>> =
	{ [TService in keyof TServiceMap]:
		{ [TMethod in keyof TServiceMap[TService]]:
			DataResponse<ReturnType<TServiceMap[TService][TMethod]>>
		}[keyof TServiceMap[TService]]
	}[keyof TServiceMap]

export type MethodDataResponse<TMethodMap extends MethodMap<TMethodMap>> =
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