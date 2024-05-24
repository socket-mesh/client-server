import { PrivateMethodMap, PublicMethodMap, ServiceMap } from "../client/maps/method-map.js";
import { MethodRequest, ServiceRequest } from "../request.js";
import { RequestMiddleware } from "./request-middleware.js";

export class OfflineMiddleware<
	TServiceMap extends ServiceMap = {},
	TOutgoingMap extends PublicMethodMap = {},
	TPrivateOutgoingMap extends PrivateMethodMap = {}
> implements RequestMiddleware<TServiceMap, TOutgoingMap, TPrivateOutgoingMap> {

	private _isOpen: boolean;
	private _requests: (MethodRequest<TOutgoingMap> | ServiceRequest<TServiceMap>)[];
	private _continue: (requests: (MethodRequest<TOutgoingMap> | ServiceRequest<TServiceMap>)[]) => void | null;

	constructor() {
		this._isOpen = false;
		this._requests = [];
		this._continue = null;
	}

	type: "request";

	public sendRequest(
		requests: (MethodRequest<TOutgoingMap> | ServiceRequest<TServiceMap>)[],
		cont: (requests: (MethodRequest<TOutgoingMap> | ServiceRequest<TServiceMap>)[]) => void
	): void {
		if (this._isOpen) {
			cont(requests);
			return;
		}

		this._continue = cont;
		this._requests.push(...requests);
	}

	public onOpen(): void {
		this._isOpen = true;
		this.flush();
	}

	public onClose(): void {
		this._isOpen = false;
	}

	public onDisconnect(): void {
		this._requests = [];
		this._continue = null;
	}

	private flush() {
		if (this._requests.length) {
			this._continue(this._requests);
			this._requests = [];
			this._continue = null;
		}
	}
}