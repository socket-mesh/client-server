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

export type ChannelMap<T> = { [K in keyof T]: JsonValue };

//export type ChannelTypes<T> = T[keyof T];