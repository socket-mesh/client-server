import { HandshakeOptions, HandshakeStatus } from "@socket-mesh/client";
import { wait } from "@socket-mesh/core";
import { processAuthentication, validateAuthToken } from "./authenticate.js";
import { dehydrateError } from "@socket-mesh/errors";
import { ServerRequestHandlerArgs } from "./server-request-handler.js";

const HANDSHAKE_REJECTION_STATUS_CODE = 4008;

export async function handshakeHandler(
	{ options, socket, transport }: ServerRequestHandlerArgs<HandshakeOptions>
): Promise<HandshakeStatus> {

	const server = socket.server;
	const wasAuthenticated = !!transport.signedAuthToken;
	const authInfo = await validateAuthToken(server.auth, options.authToken);

	for (const plugin of server.plugins) {
		if (plugin.onHandshake) {
			try {
				await plugin.onHandshake({
					socket,
					transport,
					authInfo : 'authError' in authInfo ?
						{ signedAuthToken: options.authToken, authError: authInfo.authError } :
						{ signedAuthToken: options.authToken, authToken: authInfo.authToken }
				});
			} catch (err) {
				if (err.statusCode == null) {
					err.statusCode = HANDSHAKE_REJECTION_STATUS_CODE;
				}
				throw err;
			}
		}
	}

	let authError: Error | undefined = undefined;
	let changed = false;

	try {
		changed = await processAuthentication(socket, transport, authInfo);

		if (socket.status === 'closed') {
			return {
				id: socket.id,
				pingTimeoutMs: server.pingTimeoutMs,
				authToken: options.authToken
			};
		}
	} catch (err) {
		if (options.authToken) {
			// Because the token is optional as part of the handshake, we don't count
			// it as an error if the token wasn't provided.
			authError = dehydrateError(err);
		}
	}

	transport.setReadyStatus(server.pingTimeoutMs, authError);

	// Needs to be executed after the connection event to allow consumers to be setup.
	await wait(0);

	if (changed) {
		transport.triggerAuthenticationEvents(false, wasAuthenticated);
	}

	if (authError) {
		return {
			id: socket.id,
			pingTimeoutMs: server.pingTimeoutMs,
			authError
		};
	}

	return {
		id: socket.id,
		pingTimeoutMs: server.pingTimeoutMs,
		authToken: options.authToken
	};
}