import { MethodMap, ServiceMap } from "../maps/method-map.js";
import { SocketMap } from "../maps/socket-map.js";

export type AnyResponse<T extends SocketMap> =
	Response | ErrorResponse | ServiceDataResponse<T['Service']> | MethodDataResponse<T['PrivateOutgoing']> | MethodDataResponse<T['Outgoing']>;

export function isResponsePacket<T extends SocketMap>(packet?: unknown): packet is AnyResponse<T> {
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