export function toArray<T>(arr: T | T[]): T[] {
	return Array.isArray(arr) ? arr : [arr];
}

export function wait(duration: number): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(() => {
			resolve();
		}, duration);
	});
}
