import { EmptySocketMap, SocketMap } from "../maps/socket-map.js";
import { AnyRequest } from "../core/request.js";
import { Plugin, SendRequestPluginArgs } from "./plugin.js";

const SYSTEM_METHODS = ['#handshake', '#removeAuthToken'];

export class OfflinePlugin<T extends SocketMap = EmptySocketMap> implements Plugin<T> {
	private _isReady: boolean;
	private _requests: AnyRequest<T>[][];
	private _continue: (requests: AnyRequest<T>[], cb?: (error?: Error) => void) => void| null;

	constructor() {
		this.type = 'offline';
		this._isReady = false;
		this._requests = [];
		this._continue = null;
	}

	type: "offline";

	public sendRequest({ requests, cont }: SendRequestPluginArgs<T>): void {
		if (this._isReady) {
			cont(requests);
			return;
		}

		const systemRequests = requests.filter(item => SYSTEM_METHODS.indexOf(String(item.method)) > -1);
		let otherRequests: AnyRequest<T>[] = requests;

		if (systemRequests.length) {
			otherRequests = (systemRequests.length === requests.length) ? [] : requests.filter(item => SYSTEM_METHODS.indexOf(String(item.method)) < 0);
		}

		if (otherRequests.length) {
			this._continue = cont;
			this._requests.push(otherRequests);	
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