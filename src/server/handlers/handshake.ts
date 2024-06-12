import { RequestHandlerArgs } from "../../request-handler.js";
import { BasicServerMap, HandshakeOptions, HandshakeStatus, ServerMap } from "../../client/maps/server-map.js";
import { processAuthentication, validateAuthToken } from "./authenticate.js";
import { dehydrateError } from "@socket-mesh/errors";
import { BasicSocketMapServer } from "../../client/maps/socket-map.js";
import { wait } from "../../utils.js";
import { ServerSocket } from "../server-socket.js";

const HANDSHAKE_REJECTION_STATUS_CODE = 4008;

export async function handshakeHandler(
	{ options, socket, transport }: RequestHandlerArgs<HandshakeOptions, BasicSocketMapServer, ServerSocket<BasicServerMap>>
): Promise<HandshakeStatus> {

	const state = transport.state;
	const server = state.server;
	const wasAuthenticated = !!transport.signedAuthToken;
	const authInfo = await validateAuthToken(server.auth, options.authToken);

	for (const middleware of server.middleware) {
		if (middleware.onHandshake) {
			try {
				middleware.onHandshake(
					'authError' in authInfo ?
						{ signedAuthToken: options.authToken, authError: authInfo.authError } :
						{ signedAuthToken: options.authToken, authToken: authInfo.authToken }
				);
			} catch (err) {
				if (err.statusCode == null) {
					err.statusCode = HANDSHAKE_REJECTION_STATUS_CODE;
				}
				transport.onError(err);
				socket.disconnect(err.statusCode);
				return;
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

	if (server.pendingClients[socket.id]) {
		delete server.pendingClients[socket.id];
		server.pendingClientCount--;
	}

	server.clients[socket.id] = socket;
	server.clientCount++;

	transport.setReadyStatus(server.pingTimeoutMs, authError);

	// Needs to be executed after the connection event to allow consumers to be setup.
	await wait(0);

	transport.triggerAuthenticationEvents(false, wasAuthenticated);

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