import { ChannelMap, PublishOptions } from '@socket-mesh/channels';
import { RequestHandlerArgs } from '@socket-mesh/core';

import { ClientSocket } from '../client-socket.js';
import { ClientTransport } from '../client-transport.js';
import { ClientPrivateMap } from '../maps/client-map.js';
import { ServerPrivateMap } from '../maps/server-map.js';

export async function publishHandler(
	{ options, socket }: RequestHandlerArgs<
		PublishOptions,
		ClientPrivateMap,
		{},
		ServerPrivateMap,
		{},
		{},
		ClientSocket<{}, ChannelMap>,
		ClientTransport<{}, {}, {}, {}, { }>
	>
): Promise<void> {
	socket.channels.write(options.channel, options.data);
}
