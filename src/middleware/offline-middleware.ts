import { EmptySocketMap, SocketMap } from "../client/maps/socket-map.js";
import { MethodRequest, ServiceRequest } from "../request.js";
import { Middleware } from "./middleware.js";

export class OfflineMiddleware<T extends SocketMap = EmptySocketMap> implements Middleware<T> {

	private _isOpen: boolean;
	private _requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[];
	private _continue: (requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[]) => void | null;

	constructor() {
		this._isOpen = false;
		this._requests = [];
		this._continue = null;
	}

	type: "request";

	public sendRequest(
		requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[],
		cont: (requests: (MethodRequest<T['Outgoing']> | ServiceRequest<T['Service']>)[]) => void
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