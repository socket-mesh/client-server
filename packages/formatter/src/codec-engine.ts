export interface CodecEngine {
	decode: (input: string) => any;
	encode: (object: any) => string;
}