import { RequestHandlerArgs } from "../../request-handler.js";
import { BasicServerMap, HandshakeOptions, HandshakeStatus } from "../../client/maps/server-map.js";
import { processAuthentication, validateAuthToken } from "./authenticate.js";
import { dehydrateError } from "@socket-mesh/errors";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { wait } from "../../utils.js";
import { ServerSocket } from "../server-socket.js";
import { ServerTransport } from "../server-transport.js";

const HANDSHAKE_REJECTION_STATUS_CODE = 4008;

export async function handshakeHandler(
	{ options, socket, transport }: RequestHandlerArgs<HandshakeOptions, BasicSocketMapServer, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>
): Promise<HandshakeStatus> {

	const server = socket.server;
	const wasAuthenticated = !!transport.signedAuthToken;
	const authInfo = await validateAuthToken(server.auth, options.authToken);

	for (const middleware of server.middleware) {
		if (middleware.onHandshake) {
			try {
				await middleware.onHandshake({
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
	let changed: boolean;

	try {
		changed = await processAuthentication(socket, transport, authInfo);

		if (socket.status === 'closed') {
			return;
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