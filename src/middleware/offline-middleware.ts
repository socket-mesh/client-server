import { EmptySocketMap, SocketMap } from "../client/maps/socket-map.js";
import { MethodRequest, ServiceRequest } from "../request.js";
import { Middleware, SendRequestMiddlewareArgs } from "./middleware.js";

const SYSTEM_METHODS = ['#handshake', '#removeAuthToken'];

export class OfflineMiddleware<T extends SocketMap = EmptySocketMap> implements Middleware<T> {

	private _isReady: boolean;
	private _requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[][];
	private _continue: (requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[]) => void | null;

	constructor() {
		this._isReady = false;
		this._requests = [];
		this._continue = null;
	}

	type: "offline";

	public sendRequest({ requests, cont }: SendRequestMiddlewareArgs<T>): void {
		if (this._isReady) {
			cont(requests);
			return;
		}

		const systemRequests = requests.filter(item => SYSTEM_METHODS.indexOf(String(item.method)) > -1);

		if (systemRequests.length) {
			requests = (systemRequests.length === requests.length) ? [] : requests.filter(item => SYSTEM_METHODS.indexOf(String(item.method)) < 0);
		}

		if (requests.length) {
			this._continue = cont;
			this._requests.push(requests);	
		}

		if (systemRequests.length) {
			cont(systemRequests);
		}
	}

	public onReady(): void {
		this._isReady = true;
		this.flush();
	}

	public onClose(): void {
		this._isReady = false;
	}

	public onDisconnected(): void {
		this._requests = [];
		this._continue = null;
	}

	private flush() {
		if (this._requests.length) {
			for (const reqs of this._requests) {
				this._continue(reqs);				
			}
			this._requests = [];
			this._continue = null;
		}
	}
}