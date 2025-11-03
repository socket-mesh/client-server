export interface ConsumerNode<T, TReturn = any> {
	consumerId?: number,
	data: IteratorResult<T, TReturn>,
	next: ConsumerNode<T, TReturn> | null
}
