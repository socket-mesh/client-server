export interface ChannelMap { [channel: string]: JsonValue }

export type JsonArray = Array<JsonValue>;

export interface JsonObject {
	[key: string]: JsonValue
}

export type JsonValue = JsonArray | JsonObject | Primitive;

export type Primitive =
	| boolean
	| null
	| number
	| string
	| undefined; ;

// export type ChannelTypes<T> = T[keyof T];
