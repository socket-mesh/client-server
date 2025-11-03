export interface Consumer<T, TReturn = any> {
	next(): Promise<IteratorResult<T, TReturn>>,
	return(): Promise<IteratorResult<T, TReturn>>
}

export abstract class ConsumableStream<T, TReturn = any> implements AsyncIterable<T>, AsyncIterator<T, TReturn | undefined> {
	abstract createConsumer(timeout?: number): Consumer<T, TReturn | undefined>;

	async next(timeout?: number): Promise<IteratorResult<T, TReturn | undefined>> {
		const asyncIterator = this.createConsumer(timeout);
		const result = await asyncIterator.next();
		asyncIterator.return();
		return result;
	}

	async once(timeout?: number): Promise<T | TReturn> {
		const result = await this.next(timeout);

		if (result.done) {
			// If stream was ended, this function should never resolve unless
			// there is a timeout; in that case, it should reject early.
			if (timeout == null) {
				return await new Promise(() => {});
				// const error = new Error('Stream ended before yielding a value');
				// error.name = 'StreamEndedError';
				// throw error;
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

	[Symbol.asyncIterator](): AsyncIterator<T, TReturn | undefined> {
		return this.createConsumer();
	}
}
