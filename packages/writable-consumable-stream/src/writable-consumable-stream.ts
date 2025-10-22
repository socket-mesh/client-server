import { ConsumableStream } from "@socket-mesh/consumable-stream";
import { ConsumerStats } from "./consumer-stats.js";
import { ConsumerNode } from "./consumer-node.js";
import { Consumer } from "./consumer.js";
import { WritableStreamConsumer } from "./writable-stream-consumer.js";

export interface WritableConsumableStreamOptions {
	generateConsumerId?: () => number,
	removeConsumerCallback?: (id: number) => void
}

export class WritableConsumableStream<T, TReturn = T> extends ConsumableStream<T, TReturn> {
	nextConsumerId: number;

	private _consumers: Map<number, Consumer<T, TReturn>>;
	public tailNode: ConsumerNode<T, TReturn>;
	public generateConsumerId: () => number;
	public removeConsumerCallback: (id: number) => void

	constructor(options?: WritableConsumableStreamOptions) {
		super();

		options = options || {};
		this.nextConsumerId = 1;
		this.generateConsumerId = options.generateConsumerId;

		if (!this.generateConsumerId) {
			this.generateConsumerId = () => this.nextConsumerId++;
		}

		this.removeConsumerCallback = options.removeConsumerCallback;

		this._consumers = new Map();

		// Tail node of a singly linked list.
		this.tailNode = {
			next: null,
			data: {
				value: undefined,
				done: false
			}
		};
	}

	private _write(data: IteratorResult<T, TReturn>, consumerId?: number): void {
		let dataNode: ConsumerNode<T, TReturn> = {
			data,
			next: null
		};
		if (consumerId) {
			dataNode.consumerId = consumerId;
		}
		this.tailNode.next = dataNode;
		this.tailNode = dataNode;

		for (let consumer of this._consumers.values()) {
			consumer.write(dataNode.data);
		}
	}

	write(value: T): void {
		this._write({ value, done: false });
	}

	close(value?: TReturn): void {
		this._write({ value, done: true });
	}

	writeToConsumer(consumerId: number, value: T): void {
		this._write({ value, done: false }, consumerId);
	}

	closeConsumer(consumerId: number, value?: TReturn): void {
		this._write({ value, done: true }, consumerId);
	}

	kill(value?: TReturn): void {
		for (let consumerId of this._consumers.keys()) {
			this.killConsumer(consumerId, value);
		}
	}

	killConsumer(consumerId: number, value?: TReturn): void {
		let consumer = this._consumers.get(consumerId);
		if (!consumer) {
			return;
		}
		consumer.kill(value);
	}

	getBackpressure(consumerId?: number): number {
		if (consumerId === undefined) {
			let maxBackpressure = 0;

			for (let consumer of this._consumers.values()) {
				let backpressure = consumer.getBackpressure();
	
				if (backpressure > maxBackpressure) {
					maxBackpressure = backpressure;
				}
			}

			return maxBackpressure;
		}

		let consumer = this._consumers.get(consumerId);

		if (consumer) {
			return consumer.getBackpressure();
		}

		return 0;
	}

	hasConsumer(consumerId: number): boolean {
		return this._consumers.has(consumerId);
	}

	setConsumer(consumerId: number, consumer: Consumer<T, TReturn>): void {
		this._consumers.set(consumerId, consumer);
		if (!consumer.currentNode) {
			consumer.currentNode = this.tailNode;
		}
	}

	removeConsumer(consumerId: number): boolean {
    let result = this._consumers.delete(consumerId);

    if (this.removeConsumerCallback) {
			this.removeConsumerCallback(consumerId);
		}

    return result;		
	}

	getConsumerStats(): ConsumerStats[];
	getConsumerStats(consumerId: number): ConsumerStats;
	getConsumerStats(consumerId?: number): ConsumerStats | ConsumerStats[] {
		if (consumerId === undefined) {
			let consumerStats: ConsumerStats[] = [];

			for (let consumer of this._consumers.values()) {
				consumerStats.push(consumer.getStats());
			}
	
			return consumerStats;
		}

		const consumer = this._consumers.get(consumerId);

		if (consumer) {
			return consumer.getStats();
		}

		return undefined;	
	}

	createConsumer(timeout?: number): WritableStreamConsumer<T, TReturn> {
		return new WritableStreamConsumer(this, this.generateConsumerId(), this.tailNode, timeout);
	}

	getConsumerList(): Consumer<T, TReturn>[] {
		return [...this._consumers.values()];
	}

	getConsumerCount(): number {
		return this._consumers.size;
	}
}