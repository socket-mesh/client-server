import { ConsumableStream } from '@socket-mesh/consumable-stream';

import { ConsumerNode } from './consumer-node.js';
import { ConsumerStats } from './consumer-stats.js';
import { Consumer } from './consumer.js';
import { WritableStreamConsumer } from './writable-stream-consumer.js';

export interface WritableConsumableStreamOptions {
	generateConsumerId?: () => number,
	removeConsumerCallback?: (id: number) => void
}

export class WritableConsumableStream<T, TReturn = T> extends ConsumableStream<T, TReturn | undefined> {
	private _consumers: Map<number, Consumer<T, TReturn | undefined>>;

	public generateConsumerId: () => number;
	nextConsumerId: number;
	public removeConsumerCallback?: (id: number) => void;
	public tailNode: ConsumerNode<T, TReturn | undefined>;

	constructor(options?: WritableConsumableStreamOptions) {
		super();

		options = options || {};
		this.nextConsumerId = 1;
		this.generateConsumerId = options.generateConsumerId || (() => this.nextConsumerId++);

		this.removeConsumerCallback = options.removeConsumerCallback;

		this._consumers = new Map();

		// Tail node of a singly linked list.
		this.tailNode = {
			data: {
				done: false,
				value: undefined
			},
			next: null
		} as ConsumerNode<T, TReturn | undefined>;
	}

	close(value?: TReturn): void {
		this.writeInternal({ done: true, value });
	}

	closeConsumer(consumerId: number, value?: TReturn): void {
		this.writeInternal({ done: true, value }, consumerId);
	}

	createConsumer(timeout?: number): WritableStreamConsumer<T, TReturn | undefined> {
		return new WritableStreamConsumer(this, this.generateConsumerId(), this.tailNode, timeout);
	}

	getBackpressure(consumerId?: number): number {
		if (consumerId === undefined) {
			let maxBackpressure = 0;

			for (const consumer of this._consumers.values()) {
				const backpressure = consumer.getBackpressure();

				if (backpressure > maxBackpressure) {
					maxBackpressure = backpressure;
				}
			}

			return maxBackpressure;
		}

		const consumer = this._consumers.get(consumerId);

		if (consumer) {
			return consumer.getBackpressure();
		}

		return 0;
	}

	getConsumerCount(): number {
		return this._consumers.size;
	}

	getConsumerList(): Consumer<T, TReturn | undefined>[] {
		return [...this._consumers.values()];
	}

	getConsumerStats(): ConsumerStats[];
	getConsumerStats(consumerId: number): ConsumerStats;
	getConsumerStats(consumerId?: number): ConsumerStats | ConsumerStats[] | undefined {
		if (consumerId === undefined) {
			const consumerStats: ConsumerStats[] = [];

			for (const consumer of this._consumers.values()) {
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

	hasConsumer(consumerId: number): boolean {
		return this._consumers.has(consumerId);
	}

	kill(value?: TReturn): void {
		for (const consumerId of this._consumers.keys()) {
			this.killConsumer(consumerId, value);
		}
	}

	killConsumer(consumerId: number, value?: TReturn): void {
		const consumer = this._consumers.get(consumerId);
		if (!consumer) {
			return;
		}
		consumer.kill(value);
	}

	removeConsumer(consumerId: number): boolean {
		const result = this._consumers.delete(consumerId);

		if (this.removeConsumerCallback) {
			this.removeConsumerCallback(consumerId);
		}

		return result;
	}

	setConsumer(consumerId: number, consumer: Consumer<T, TReturn | undefined>): void {
		this._consumers.set(consumerId, consumer);
		if (!consumer.currentNode) {
			consumer.currentNode = this.tailNode;
		}
	}

	write(value: T): void {
		this.writeInternal({ done: false, value });
	}

	private writeInternal(data: IteratorResult<T, TReturn | undefined>, consumerId?: number): void {
		const dataNode: ConsumerNode<T, TReturn | undefined> = {
			data,
			next: null
		};
		if (consumerId) {
			dataNode.consumerId = consumerId;
		}
		this.tailNode.next = dataNode;
		this.tailNode = dataNode;

		for (const consumer of this._consumers.values()) {
			consumer.write(dataNode.data);
		}
	}

	writeToConsumer(consumerId: number, value: T): void {
		this.writeInternal({ done: false, value }, consumerId);
	}
}
