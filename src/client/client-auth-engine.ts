import { SignedAuthToken } from "@socket-mesh/auth";

export interface ClientAuthEngine {
	saveToken(token: SignedAuthToken, options?: { [key: string]: any } ): Promise<SignedAuthToken>;
	
	removeToken(): Promise<SignedAuthToken>;
	
	loadToken(): Promise<SignedAuthToken | null>;
}

export function isAuthEngine(auth: ClientAuthEngine | LocalStorageAuthEngineOptions): auth is ClientAuthEngine {
	return (typeof auth === 'object' && 'saveToken' in auth && 'removeToken' in auth && 'loadToken' in auth);
}

export interface LocalStorageAuthEngineOptions {
	// The name of the JWT auth token (provided to the authEngine - By default this is the localStorage variable name);
	// defaults to 'socketmesh.authToken'.
	authTokenName?: string;
}

export class LocalStorageAuthEngine implements ClientAuthEngine {
	private readonly _authTokenName: string;
	private readonly _internalStorage: {[key: string]: string};
	public readonly isLocalStorageEnabled: boolean;

	constructor({ authTokenName }: LocalStorageAuthEngineOptions = {}) {
		this._internalStorage = {};
		this.isLocalStorageEnabled = this._checkLocalStorageEnabled();
		this._authTokenName = authTokenName ?? 'socketmesh.authToken';
	}

	private _checkLocalStorageEnabled(): boolean {
		let err;

		try {
			// Safari, in Private Browsing Mode, looks like it supports localStorage but all calls to setItem
			// throw QuotaExceededError. We're going to detect this and avoid hard to debug edge cases.
			localStorage.setItem('__localStorageTest', "1");
			localStorage.removeItem('__localStorageTest');
		} catch (e) {
			err = e;
		}

		return !err;
	}

	async saveToken(token: string): Promise<SignedAuthToken> {
		if (this.isLocalStorageEnabled) {
			localStorage.setItem(this._authTokenName, token);
		} else {
			this._internalStorage[this._authTokenName] = token;
		}
		return token;
	}
	
	async removeToken(): Promise<SignedAuthToken> {
		let loadPromise = this.loadToken();
	
		if (this.isLocalStorageEnabled) {
			localStorage.removeItem(this._authTokenName);
		} else {
			delete this._internalStorage[this._authTokenName];
		}
	
		return loadPromise;
	}
	
	async loadToken(): Promise<SignedAuthToken> {
		let token;
	
		if (this.isLocalStorageEnabled) {
			token = localStorage.getItem(this._authTokenName);
		} else {
			token = this._internalStorage[this._authTokenName] || null;
		}
	
		return token;
	}
}