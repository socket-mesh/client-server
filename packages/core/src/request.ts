import { MethodMap, PrivateMethodMap, PublicMethodMap, ServiceMap } from './maps/method-map.js';
import { toArray } from './utils.js';

export type AnyRequest<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> =
	MethodRequest<TOutgoing> | MethodRequest<TPrivateOutgoing> | ServiceRequest<TService>;

export interface InvokeMethodRequest<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> extends TransmitMethodRequest<TMethodMap, TMethod> {
	ackTimeoutMs: false | number,
	callback: ((err: Error | null, result?: TMethodMap[TMethod]) => void) | null,
	cid: number,
	timeoutId?: NodeJS.Timeout
}

export interface InvokeServiceRequest<TServiceMap extends ServiceMap, TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]> extends TransmitServiceRequest<TServiceMap, TService, TMethod> {
	ackTimeoutMs: false | number,
	callback: ((err: Error | null, result?: TServiceMap[TService][TMethod]) => void) | null,
	cid: number,
	timeoutId?: NodeJS.Timeout
}

export type MethodRequest<TMethodMap extends MethodMap> =
	{ [TMethod in keyof TMethodMap]:
		InvokeMethodRequest<TMethodMap, TMethod> | TransmitMethodRequest<TMethodMap, TMethod>
	}[keyof TMethodMap];

export interface Request {
	promise: Promise<void>,
	sentCallback?: (err?: Error) => void
}

export type ServiceRequest<TServiceMap extends ServiceMap> =
	{ [TService in keyof TServiceMap]:
		{ [TMethod in keyof TServiceMap[TService]]:
			InvokeServiceRequest<TServiceMap, TService, TMethod> | TransmitServiceRequest<TServiceMap, TService, TMethod>
		}[keyof TServiceMap[TService]]
	}[keyof TServiceMap];

export interface TransmitMethodRequest<TMethodMap extends MethodMap, TMethod extends keyof TMethodMap> extends Request {
	data?: Parameters<TMethodMap[TMethod]>[0],
	method: TMethod
}

export interface TransmitServiceRequest<TServiceMap extends ServiceMap, TService extends keyof TServiceMap, TMethod extends keyof TServiceMap[TService]> extends Request {
	data?: Parameters<TServiceMap[TService][TMethod]>[0],
	method: TMethod,
	service: TService
}

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

export class RequestCollection<
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap
> {
	private readonly _callbacks: (() => void)[];
	private readonly _requests: AnyRequest<TOutgoing, TPrivateOutgoing, TService>[];

	constructor(requests: AnyRequest<TOutgoing, TPrivateOutgoing, TService> | AnyRequest<TOutgoing, TPrivateOutgoing, TService>[]) {
		this._requests = toArray(requests).filter(req => !isRequestDone<TOutgoing, TPrivateOutgoing, TService>(req));
		this._callbacks = [];
	}

	public isDone(): boolean {
		return this._requests.length === 0;
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

	[Symbol.iterator]() {
		const values = this._requests;
		let index = 0;

		return {
			next() {
				if (index < values.length) {
					const val = values[index];
					index++;
					return { done: false, value: val };
				} else return { done: true };
			}
		};
	}
}
