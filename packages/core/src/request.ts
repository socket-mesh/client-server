import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from "./maps/method-map.js";
import { toArray } from "./utils.js";

export type AnyRequest<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> =
	ServiceRequest<TService> | MethodRequest<TPrivateOutgoing> | MethodRequest<TOutgoing>;

export function abortRequest<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
>(request: AnyRequest<TOutgoing, TPrivateOutgoing, TService>, err: Error): void {
	if (request.sentCallback) {
		request.sentCallback(err);
	}

	if ('callback' in request && request.callback) {
		request.callback(err);
	}
}

export class RequestCollection<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> {
	private readonly _requests: AnyRequest<TOutgoing, TPrivateOutgoing, TService>[];
	private readonly _callbacks: (() => void)[];

	constructor(requests: AnyRequest<TOutgoing, TPrivateOutgoing, TService> | AnyRequest<TOutgoing, TPrivateOutgoing, TService>[]) {
		this._requests = toArray(requests).filter(req => !isRequestDone<TOutgoing, TPrivateOutgoing, TService>(req));
		this._callbacks = [];
	}

	public get items(): ReadonlyArray<AnyRequest<TOutgoing, TPrivateOutgoing, TService>> {
		return this._requests;
	}

	public listen(cb: () => void): void {
		for (const req of this._requests) {
			this._callbacks.push(cb);

			req.promise.finally(() => {
				const i = this._requests.indexOf(req);
				this._requests.splice(i, 1);

				if (!this._requests.length) {
					for (const cb of this._callbacks) {
						cb();
					}
				}
			});
		}
	}

	public isDone(): boolean {
		return this._requests.length === 0;
	}

	[Symbol.iterator]() {
    const values = this._requests;
    let index = 0;

    return {
      next() {
        if (index < values.length) {
          const val = values[index];
          index++;
          return { value: val, done: false };
        } else return { done: true };
      }
    };
	}
}

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
	promise: Promise<void>,
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
	callback: null | ((err: Error | null, result?: TServiceMap[TService][TMethod]) => void)
}

export interface InvokeMethodRequest<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> extends TransmitMethodRequest<TMethodMap, TMethod> {
	cid: number,
	ackTimeoutMs: number | false,
	timeoutId?: NodeJS.Timeout;
	callback: null | ((err: Error | null, result?: TMethodMap[TMethod]) => void)
}

export function isRequestDone<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
>(request: AnyRequest<TOutgoing, TPrivateOutgoing, TService>): boolean {
	if ('callback' in request) {
		return (request.callback === null);
	}

	return !request.sentCallback;
}