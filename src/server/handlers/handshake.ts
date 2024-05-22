import { RequestHandlerArgs } from "../../request-handler.js";
import { HandshakeOptions, HandshakeStatus } from "../../client/maps/server-private-map.js";
import { ServerSocketState } from "../server-socket-state.js";
import { processAuthentication, validateAuthToken } from "./authenticate.js";
import { dehydrateError } from "@socket-mesh/errors";

const HANDSHAKE_REJECTION_STATUS_CODE = 4008;

export async function handshakeHandler(
	{ options, socket, transport }: RequestHandlerArgs<HandshakeOptions, ServerSocketState>
): Promise<HandshakeStatus> {
	const state = transport.state;
	const server = state.server;
	const authInfo = await validateAuthToken(server.auth, options.authToken);

	for (const middleware of server.middleware) {
		if ('onHandshake' in middleware) {
			try {
				transport.callMiddleware(
					middleware,
					() => {
						middleware.onHandshake(
							'authError' in authInfo ?
								{ signedAuthToken: options.authToken, authError: authInfo.authError } :
								{ signedAuthToken: options.authToken, authToken: authInfo.authToken }
						);			
					}
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

	try {
		await processAuthentication(socket, transport, authInfo);

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

	transport.setOpenStatus();

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