export interface DemuxConsumerPacket<T> {
	consumerId: number,
	data: IteratorResult<T, T>
}

export type DemuxPacket<T> = DemuxConsumerPacket<T> | DemuxStreamPacket<T>;

export interface DemuxStreamPacket<T> {
	data: IteratorResult<T, T>,
	stream: string
}
