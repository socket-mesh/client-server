import { Consumer as StreamConsumer } from "@socket-mesh/consumable-stream";
import { ConsumerNode } from "./consumer-node.js";
import { Consumer } from "./consumer.js";
import { WritableConsumableStream } from "./writable-consumable-stream.js";

export class WritableStreamConsumer<T, TReturn = T> extends Consumer<T, TReturn> implements StreamConsumer<T, TReturn> {
	constructor(stream: WritableConsumableStream<T, TReturn>, id: number, startNode: ConsumerNode<T, TReturn>, timeout?: number) {
		super(stream, id, startNode, timeout);
	}

	async next(): Promise<IteratorResult<T, TReturn>> {
		this.stream.setConsumer(this.id, this);

		while (true) {
			if (!this.currentNode) {
				this._destroy();
				throw new Error("Consumer has been destroyed");
			}

			if (!this.currentNode.next) {
				try {
					await this._waitForNextItem(this.timeout);
				} catch (error) {
					this._destroy();
					throw error;
				}
			}

			if (this._killPacket) {
				this._destroy();
				let killPacket = this._killPacket;
				delete this._killPacket;

				return killPacket;
			}

			this.currentNode = this.currentNode.next!;
			this.releaseBackpressure(this.currentNode.data);

			if (this.currentNode.consumerId && this.currentNode.consumerId !== this.id) {
				continue;
			}

			if (this.currentNode.data.done) {
				this._destroy();
			}

			return this.currentNode.data;
		}
	}

	return(): Promise<IteratorResult<T, TReturn>> {
		this.currentNode = null;
		this._destroy();
		return {} as any;
	}
}