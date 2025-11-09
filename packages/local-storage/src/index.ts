export class LocalStorage implements Storage {
	[key: string | symbol]: any

	private readonly _data: { [ key: string]: string };

	constructor() {
		this._data = {};
	}

	clear(): void {
		for (const key of Object.keys(this._data)) {
			delete this._data[key];
		}
	}

	getItem(key: string): null | string {
		if (Object.prototype.hasOwnProperty.call(this._data, key)) {
			return String(this._data[key]);
		}
		return null;
	}

	hasItem(key: string): boolean {
		return Object.prototype.hasOwnProperty.call(this._data, key);
	}

	key(i: number): null | string {
		i = i || 0;
		return Object.keys(this._data)[i] ?? null;
	}

	get length(): number {
		return Object.keys(this._data).length;
	}

	removeItem(key: string): void {
		delete this._data[key];
	}

	setItem(key: string, val: any): void {
		this._data[key] = String(val);
	}
}

export class LocalStorageProxyHandler implements ProxyHandler<LocalStorage> {
	constructor() {
	}

	get(target: LocalStorage, p: string | symbol, receiver: any): any {
		if (p in target && p !== 'hasItem') {
			return target[p];
		}

		if (target.hasItem(p as string)) {
			return target.getItem(p as string);
		}

		return undefined;
	}
}

const localStorage: Storage = 'localStorage' in globalThis ? globalThis.localStorage : new Proxy<LocalStorage>(new LocalStorage(), new LocalStorageProxyHandler());

export default localStorage;
