import { PublishOptions } from "@socket-mesh/channels";

export interface ExchangeClient {
	id: string,

	transmit(event: '#publish', options: PublishOptions): Promise<void>;
}