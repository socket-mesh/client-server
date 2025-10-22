export class LocalStorage implements Storage {
	private readonly _data: {[ key: string]: string};

	constructor() {
		this._data = {};
	}

	getItem(key: string) {
		if (this._data.hasOwnProperty(key)) {
			return String(this._data[key]);
		}
		return null;
	}

	setItem(key: string, val: any) {
		this._data[key] = String(val);
	}

	removeItem(key: string) {
		delete this._data[key];
	}

	clear() {
		const self = this;

		Object.keys(self._data).forEach(function (key) {
			self._data[key] = undefined;
			delete self._data[key];
		});
	}

	key(i: number): string {
		i = i || 0;
		return Object.keys(this._data)[i];
	}

	hasItem(key: string): boolean {
		return this._data.hasOwnProperty(key);
	}

	get length(): number {
		return Object.keys(this._data).length;
	}

	[key: string | symbol]: any
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