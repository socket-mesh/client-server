export type Primitive =
  | boolean
  | null
  | number
  | string
  | undefined;

	export interface JsonObject {
  [key: string]: JsonValue;
}

export interface JsonArray extends Array<JsonValue> {}

export type JsonValue = Primitive | JsonObject | JsonArray;

export interface ChannelMap { [channel: string]: JsonValue };

//export type ChannelTypes<T> = T[keyof T];