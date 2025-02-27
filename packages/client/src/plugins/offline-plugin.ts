import { AnyRequest, MethodMap, Plugin, PrivateMethodMap, PublicMethodMap, SendRequestPluginArgs, ServiceMap } from "@socket-mesh/core";

const SYSTEM_METHODS = ['#handshake', '#removeAuthToken'];

export class OfflinePlugin<
	TIncoming extends MethodMap,
	TOutgoing extends PublicMethodMap,
	TPrivateOutgoing extends PrivateMethodMap,
	TService extends ServiceMap,
	TState extends object
> implements Plugin<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState> {
	private _isReady: boolean;
	private _requests: AnyRequest<TOutgoing, TPrivateOutgoing, TService>[][];
	private _continue: (requests: AnyRequest<TOutgoing, TPrivateOutgoing, TService>[], cb?: (error?: Error) => void) => void| null;

	constructor() {
		this.type = 'offline';
		this._isReady = false;
		this._requests = [];
		this._continue = null;
	}

	type: "offline";

	public sendRequest({ requests, cont }: SendRequestPluginArgs<TIncoming, TOutgoing, TPrivateOutgoing, TService, TState>): void {
		if (this._isReady) {
			cont(requests);
			return;
		}

		const systemRequests = requests.filter(item => SYSTEM_METHODS.indexOf(String(item.method)) > -1);
		let otherRequests: AnyRequest<TOutgoing, TPrivateOutgoing, TService>[] = requests;

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