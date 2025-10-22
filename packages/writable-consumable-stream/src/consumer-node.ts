export interface ConsumerNode<T, TReturn = any> {
	consumerId?: number,
	next: ConsumerNode<T, TReturn> | null,
	data: IteratorResult<T, TReturn>
}