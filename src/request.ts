import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./client/maps/method-map.js";

export type AnyRequest<
	TServiceMap extends ServiceMap,
	TPrivateOutgoingMap extends PrivateMethodMap,
	TOutgoingMap extends PublicMethodMap
> = ServiceRequest<TServiceMap> | MethodRequest<TPrivateOutgoingMap> | MethodRequest<TOutgoingMap>;

export type ServiceRequest<TServiceMap extends ServiceMap> =
	{ [TService in keyof TServiceMap]:
		{ [TMethod in keyof TServiceMap[TService]]:
			TransmitServiceRequest<TServiceMap, TService, TMethod> | InvokeServiceRequest<TServiceMap, TService, TMethod> 
		}[keyof TServiceMap[TService]]
	}[keyof TServiceMap]

export type MethodRequest<TMethodMap extends MethodMap> =
	{ [TMethod in keyof TMethodMap]: 
		TransmitMethodRequest<TMethodMap, TMethod> | InvokeMethodRequest<TMethodMap, TMethod>
	}[keyof TMethodMap]


export interface Request {
	sentCallback?: (err?: Error) => void
}

export interface TransmitServiceRequest<TServiceMap extends ServiceMap, TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]> extends Request {
	service: TService,
	method: TMethod,
	data?: Parameters<TServiceMap[TService][TMethod]>[0]
}

export interface TransmitMethodRequest<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> extends Request {
	method: TMethod,
	data?: Parameters<TMethodMap[TMethod]>[0]
}

export interface InvokeServiceRequest<TServiceMap extends ServiceMap, TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]> extends TransmitServiceRequest<TServiceMap, TService, TMethod> {
	cid: number,
	ackTimeoutMs: number | false,
	timeoutId?: NodeJS.Timeout;
	callback: (err: Error, result?: TServiceMap[TService][TMethod]) => void | null
}

export interface InvokeMethodRequest<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> extends TransmitMethodRequest<TMethodMap, TMethod> {
	cid: number,
	ackTimeoutMs: number | false,
	timeoutId?: NodeJS.Timeout;
	callback: (err: Error, result?: TMethodMap[TMethod]) => void | null
}


export type AnyPacket<
	TServiceMap extends ServiceMap,
	TIncomingMap extends MethodMap
> = ServicePacket<TServiceMap> | MethodPacket<TIncomingMap>;

export type ServicePacket<TServiceMap extends ServiceMap> =
	{ [TService in keyof TServiceMap]:
		{ [TMethod in keyof TServiceMap[TService]]:
			ServiceRequestPacket<TServiceMap, TService, TMethod>
		}[keyof TServiceMap[TService]]
	}[keyof TServiceMap]

export interface RequestPacket {
	cid?: number,
	requestedAt: Date
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
	data?: Parameters<TMethodMap[TMethod]>[0],
	ackTimeoutMs?: number | boolean
}