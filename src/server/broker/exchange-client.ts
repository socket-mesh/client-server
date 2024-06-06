import { PublishOptions } from "../../channels/channels";

export interface ExchangeClient {
	id: string,

	transmit(event: '#publish', options: PublishOptions): Promise<void>;
}