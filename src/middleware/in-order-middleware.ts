import { RawData } from "ws";
import { EmptySocketMap, SocketMap } from "../client/maps/socket-map.js";
import { MessageRawMiddlewareArgs, Middleware, MiddlewareArgs, SendRequestMiddlewareArgs } from "./middleware.js";
import { WritableConsumableStream } from "@socket-mesh/writable-consumable-stream";
import ws from "isomorphic-ws";
import { RequestCollection } from "../request.js";

interface InboundMessage<T extends SocketMap> extends MessageRawMiddlewareArgs<T> {
	callback: (err: Error | null, data: string | ws.RawData) => void
}

export class InOrderMiddleware<T extends SocketMap = EmptySocketMap> implements Middleware<T> {
	type: 'inOrder'

	private readonly _inboundMessageStream: WritableConsumableStream<InboundMessage<T>>;
	//private readonly _outboundMessageStream: WritableConsumableStream<SendRequestMiddlewareArgs<T>>;

	constructor() {
		this._inboundMessageStream = new WritableConsumableStream<InboundMessage<T>>();
		//this._outboundMessageStream = new WritableConsumableStream<SendRequestMiddlewareArgs<T>>;
		this.handleInboundMessageStream();
		//this.handleOutboundMessageStream();
	}

	handleInboundMessageStream(): void {
		(async () => {
			for await (let { message, callback, promise } of this._inboundMessageStream) {
				callback(null, message);
				try {
					await promise;					
				} catch (err) {
					// Dont throw it is handled in the socket transport
				}
			}
		})();
	}

/*
	handleOutboundMessageStream(): void {
		(async () => {
			for await (let { requests, cont } of this._outboundMessageStream) {
				await new Promise<void>((resolve) => {
					const reqCol = new RequestCollection(requests);

					if (reqCol.isDone()) {
						resolve();
						cont(requests);
						return;
					}

					reqCol.listen(() => {
						resolve();
					});

					cont(requests);
				});
			}
		})();
	}
*/

	onEnd({ transport }: MiddlewareArgs<T>): void {
		if (transport.streamCleanupMode === 'close') {
			this._inboundMessageStream.close();
			//this._outboundMessageStream.close();
		} else if (transport.streamCleanupMode === 'kill') {
			this._inboundMessageStream.kill();
			//this._outboundMessageStream.kill();
		}
	}

	onMessageRaw(options: MessageRawMiddlewareArgs<T>): Promise<string | RawData> {
		let callback: (err: Error | null, data: string | ws.RawData) => void;

		const promise = new Promise<string | RawData>((resolve, reject) => {
			callback = (err, data) => {
				if (err) {
					reject(err);
					return;
				}

				resolve(data);
			}
		});

		this._inboundMessageStream.write({ callback, ...options });

		return promise;
	}

	//sendRequest(options: SendRequestMiddlewareArgs<T>): void {
	//	this._outboundMessageStream.write(options);
	//}
}