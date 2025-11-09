import { AuthToken, SignedAuthToken } from '@socket-mesh/auth';
import { AuthEngine } from '@socket-mesh/auth-engine';
import { AuthTokenError, AuthTokenExpiredError, AuthTokenInvalidError, AuthTokenNotBeforeError, InvalidActionError } from '@socket-mesh/errors';
import jwt from 'jsonwebtoken';

import { ServerSocket } from '../server-socket.js';
import { ServerTransport } from '../server-transport.js';
import { ServerRequestHandlerArgs } from './server-request-handler.js';

const handshakeRejectionStatusCode = 4008;

export type AuthInfo = InvalidAuthInfo | ValidAuthInfo;

export interface InvalidAuthInfo {
	authError: AuthTokenError,
	signedAuthToken: SignedAuthToken
};

export interface ValidAuthInfo {
	authToken: AuthToken,
	signedAuthToken: SignedAuthToken
}

export async function authenticateHandler(
	{ isRpc, options: signedAuthToken, socket, transport }: ServerRequestHandlerArgs<string>
): Promise<void> {
	if (!isRpc) {
		socket.disconnect(handshakeRejectionStatusCode);

		throw new InvalidActionError('Handshake request was malformatted');
	}

	const authInfo = await validateAuthToken(socket.server.auth, signedAuthToken);

	await processAuthentication(socket, transport, authInfo);
}

export async function processAuthentication(
	socket: ServerSocket,
	transport: ServerTransport,
	authInfo: AuthInfo
): Promise<boolean> {
	if ('authError' in authInfo) {
		await transport.changeToUnauthenticatedState();

		// If the error is related to the JWT being badly formatted, then we will
		// treat the error as a socket error.
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (authInfo.signedAuthToken != null) {
			transport.onError(authInfo.authError);

			if (authInfo.authError instanceof AuthTokenError) {
				socket.emit('badAuthToken', { error: authInfo.authError, signedAuthToken: authInfo.signedAuthToken });
			}
		}

		throw authInfo.authError;
	}

	for (const plugin of socket.server.plugins) {
		if (plugin.onAuthenticate) {
			try {
				plugin.onAuthenticate(authInfo);
			} catch (err) {
				await transport.changeToUnauthenticatedState();

				if (err instanceof AuthTokenError) {
					socket.emit('badAuthToken', { error: err, signedAuthToken: authInfo.signedAuthToken });
				}
				throw err;
			}
		}
	}

	return await transport.setAuthorization(authInfo.signedAuthToken, authInfo.authToken);
}

function processTokenError(err: jwt.VerifyErrors): AuthTokenError {
	if (err.name === 'TokenExpiredError' && 'expiredAt' in err) {
		return new AuthTokenExpiredError(err.message, err.expiredAt);
	}
	if (err.name === 'JsonWebTokenError') {
		return new AuthTokenInvalidError(err.message);
	}
	if (err.name === 'NotBeforeError' && 'date' in err) {
		// In this case, the token is good; it's just not active yet.
		return new AuthTokenNotBeforeError(err.message, err.date);
	}

	return new AuthTokenError(err.message);
}

export async function validateAuthToken(
	auth: AuthEngine, authToken: SignedAuthToken, verificationOptions?: jwt.VerifyOptions
): Promise<AuthInfo> {
	try {
		return {
			authToken: await auth.verifyToken(authToken, verificationOptions),
			signedAuthToken: authToken
		};
	} catch (error) {
		return {
			authError: processTokenError(error),
			signedAuthToken: authToken
		};
	}
}
