type Primitive =
  | boolean
  | null
  | number
  | string
  | undefined;

interface JsonObject {
  [key: string]: JsonValue;
}

interface JsonArray extends Array<JsonValue> {}

type JsonValue = Primitive | JsonObject | JsonArray;

export interface ChannelMap { [channel: string]: JsonValue };

//export type ChannelTypes<T> = T[keyof T];