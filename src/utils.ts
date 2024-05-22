export function wait(duration: number): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(() => {
			resolve();
		}, duration);
	});
}

export interface AbortablePromise<T> extends Promise<T> {
  abort(): void
}