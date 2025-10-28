import { ConsumerStats } from "./consumer-stats.js";
import { ConsumerNode } from "./consumer-node.js";
import { WritableConsumableStream } from "./writable-consumable-stream.js";

export abstract class Consumer<T, TReturn = T> {
	id: number;
	isAlive: boolean;
	stream: WritableConsumableStream<T, TReturn>;
	currentNode: ConsumerNode<T, TReturn> | null;
	timeout?: number;

	private _backpressure: number;
	private _timeoutId?: NodeJS.Timeout;
	protected _killPacket?: IteratorReturnResult<TReturn | undefined>;
	protected _resolve?: () => void;

	constructor(stream: WritableConsumableStream<T, TReturn>, id: number, startNode: ConsumerNode<T, TReturn>, timeout?: number) {
		this.id = id;
		this._backpressure = 0;
		this.currentNode = startNode;
		this.timeout = timeout;
		this.isAlive = true;
		this.stream = stream;
		this.stream.setConsumer(this.id, this);
	}

	clearActiveTimeout(packet?: IteratorResult<T, TReturn | undefined>) {
		if (this._timeoutId !== undefined) {
			clearTimeout(this._timeoutId);
			delete this._timeoutId;
		}
	}

	getStats(): ConsumerStats {
		const stats: ConsumerStats = {
			id: this.id,
			backpressure: this._backpressure
		};

		if (this.timeout != null) {
			stats.timeout = this.timeout;
		}
		return stats;
	}

	private _resetBackpressure(): void {
		this._backpressure = 0;
	}

	applyBackpressure(packet: IteratorResult<T, TReturn>): void {
		this._backpressure++;
	}

	releaseBackpressure(packet: IteratorResult<T, TReturn>): void {
		this._backpressure--;
	}

	getBackpressure(): number {
		return this._backpressure;
	}

	write(packet: IteratorResult<T, TReturn>): void {
		this.clearActiveTimeout(packet);
		this.applyBackpressure(packet);
		if (this._resolve) {
			this._resolve();
			delete this._resolve;
		}
	}

	kill(value?: TReturn): void {
		this._killPacket = { value, done: true };
		if (this._timeoutId !== undefined) {
			this.clearActiveTimeout(this._killPacket);
		}
		this._killPacket = { value, done: true };
		this._destroy();

		if (this._resolve) {
			this._resolve();
			delete this._resolve;
		}
	}

	protected _destroy(): void {
		this.isAlive = false;
		this._resetBackpressure();
		this.stream.removeConsumer(this.id);
	}

	protected async _waitForNextItem(timeout?: number): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this._resolve = resolve;
			let timeoutId: NodeJS.Timeout;

			if (timeout !== undefined) {
				// Create the error object in the outer scope in order
				// to get the full stack trace.
				let error = new Error('Stream consumer iteration timed out');
				(async () => {
					let delay = wait(timeout);
					timeoutId = delay.timeoutId;
					await delay.promise;
					error.name = 'TimeoutError';
					delete this._resolve;
					reject(error);
				})();
			}

			this._timeoutId = timeoutId!;
		});
	}

	[Symbol.asyncIterator]() {
		return this;
	}
}

function wait(timeout: number): { timeoutId: NodeJS.Timeout, promise: Promise<void> } {
	let timeoutId: NodeJS.Timeout | undefined = undefined;

	let promise: Promise<void> = new Promise((resolve) => {
		timeoutId = setTimeout(resolve, timeout);
	});

	return { timeoutId: timeoutId!, promise };
}