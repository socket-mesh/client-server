export type BrokerEvent<T> = ErrorEvent | PublishEvent<T> | ReadyEvent | SubscribeEvent | UnsubscribeEvent;

export interface ErrorEvent {
	error: Error
}

export interface ReadyEvent {}

export interface SubscribeEvent {
	channel: string
}

export interface UnsubscribeEvent {
	channel: string
}

export interface PublishEvent<T> {
	channel: string,
	data: T
}