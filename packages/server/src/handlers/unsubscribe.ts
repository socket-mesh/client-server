import { BrokerError } from "@socket-mesh/errors";
import { ServerRequestHandlerArgs } from "./server-request-handler.js";

export async function unsubscribeHandler(
	{ transport, options: channel }: ServerRequestHandlerArgs<string>
): Promise<void> {
	try {
		await transport.unsubscribe(channel);
	} catch (err) {
		throw new BrokerError(
			`Failed to unsubscribe socket from the ${channel} channel - ${err}`
		);
	}
}