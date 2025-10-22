export type DemuxPacket<T> = DemuxStreamPacket<T> | DemuxConsumerPacket<T>;

export interface DemuxStreamPacket<T> {
	stream: string,
	data: IteratorResult<T, T>
}

export interface DemuxConsumerPacket<T> {
	consumerId: number,
	data: IteratorResult<T, T>
}