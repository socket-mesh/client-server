export abstract class ConsumableStream<T, TReturn = any> implements AsyncIterator<T, TReturn>, AsyncIterable<T> {
	async next(timeout?: number): Promise<IteratorResult<T, TReturn>> {
		let asyncIterator = this.createConsumer(timeout);
		let result = await asyncIterator.next();
		asyncIterator.return();
		return result;
	}

	async once(timeout?: number): Promise<T | TReturn> {
		let result = await this.next(timeout);

		if (result.done) {
			// If stream was ended, this function should never resolve unless
			// there is a timeout; in that case, it should reject early.
			if (timeout == null) {
				await new Promise(() => {});
			} else {
				const error = new Error(
					'Stream consumer operation timed out early because stream ended'
				);
				error.name = 'TimeoutError';
				throw error;
			}
		}

		return result.value;
	}

	abstract createConsumer(timeout?: number): Consumer<T, TReturn>

	[Symbol.asyncIterator](): AsyncIterator<T, TReturn> {
		return this.createConsumer();
	}
}

export interface Consumer<T, TReturn = any> {
	next(): Promise<IteratorResult<T, TReturn>>;
	return(): Promise<IteratorResult<T, TReturn>>;
}