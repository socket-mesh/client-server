import { PublishOptions } from "../../channels/channels.js";
import { RequestHandlerArgs } from "../../request-handler.js";
import { ClientSocket } from "../client-socket.js";
import { ClientTransport } from "../client-transport.js";
import { ClientMap } from "../maps/client-map.js";
import { BasicSocketMapClient } from "../maps/socket-map.js";

export async function publishHandler(
	{ socket, options }: RequestHandlerArgs<PublishOptions, BasicSocketMapClient, ClientSocket<ClientMap>, ClientTransport<ClientMap>>
): Promise<void> {
	socket.channels.write(options.channel, options.data);
}