import { afterEach, beforeEach, describe, it } from "node:test";
import { ClientSocketOptions } from "../src/client/client-socket-options";
import { ClientSocket } from "../src/client/client-socket";
import { Server, ServerSocket, listen } from "../src";
import { BasicServerMap } from "../src/client/maps/server-map";
import { ServerOptions } from "../src/server/server-options";
import { AuthToken } from "@socket-mesh/auth";
import { RequestHandlerArgs } from "../src/request-handler";
import jwt from "jsonwebtoken";
import { BasicSocketMapServer } from "../src/client/maps/socket-map";
import { ServerTransport } from "../src/server/server-transport";
import { AuthInfo } from "../src/server/handlers/authenticate";
import assert from "node:assert";
import localStorage from '@socket-mesh/local-storage';
import { wait } from "../src/utils";
import { AuthStateChangeEvent, AuthenticatedChangeEvent, CloseEvent } from "../src/socket-event";
import { SocketAuthStateChangeEvent } from "../src/server/server-event";
import { MiddlewareBlockedError } from "@socket-mesh/errors";

// Add to the global scope like in browser.
global.localStorage = localStorage;

const PORT_NUMBER = 8008;
//const WS_ENGINE = 'ws';
const LOG_WARNINGS = false;
const LOG_ERRORS = false;

const TEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 10;
const authTokenName = 'socketmesh.authToken';

const validSignedAuthTokenBob = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImJvYiIsImV4cCI6MzE2Mzc1ODk3OTA4MDMxMCwiaWF0IjoxNTAyNzQ3NzQ2fQ.dSZOfsImq4AvCu-Or3Fcmo7JNv1hrV3WqxaiSKkTtAo';
const validSignedAuthTokenAlice = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImFsaWNlIiwiaWF0IjoxNTE4NzI4MjU5LCJleHAiOjMxNjM3NTg5NzkwODAzMTB9.XxbzPPnnXrJfZrS0FJwb_EAhIu2VY5i7rGyUThtNLh4';
const invalidSignedAuthToken = 'fakebGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fakec2VybmFtZSI6ImJvYiIsImlhdCI6MTUwMjYyNTIxMywiZXhwIjoxNTAyNzExNjEzfQ.fakemYcOOjM9bzmS4UYRvlWSk_lm3WGHvclmFjLbyOk';
const SERVER_AUTH_KEY = 'testkey';

type MyChannels = {
	foo: string,
	bar: string
}

type ServerIncomingMap = {
	login: (auth: AuthToken) => void,
	loginWithTenDayExpiry: (auth: AuthToken) => void,
	loginWithTenDayExp: (auth: AuthToken) => void,
	loginWithTenDayExpAndExpiry: (auth: AuthToken) => void,
	loginWithIssAndIssuer: (auth: AuthToken) => void,
	setAuthKey: (secret: jwt.Secret) => void,
	proc: (num: number) => string
}

interface MyClientMap {
	Channel: MyChannels,
	Incoming: {},
	Service: {},
	Outgoing: ServerIncomingMap,
	PrivateOutgoing: {},
	State: {}
};

function bindFailureHandlers(server: Server<BasicServerMap<ServerIncomingMap, MyChannels>>) {
	if (LOG_ERRORS) {
		(async () => {
			for await (let {error} of server.listen('error')) {
				console.error('ERROR', error);
			}
		})();
	}
	if (LOG_WARNINGS) {
		(async () => {
			for await (let { warning } of server.listen('warning')) {
				console.warn('WARNING', warning);
			}
		})();
	}
}

const allowedUsers: {[user: string]: true } = {
	bob: true,
	alice: true
};

async function loginHandler({ transport, options: authToken }: RequestHandlerArgs<AuthToken>): Promise<void> {
	if (!allowedUsers[authToken.username]) {
		const err = new Error('Failed to login');
		err.name = 'FailedLoginError';
		throw err;
	}

	await transport.setAuthorization(authToken);
}

async function loginWithTenDayExpiryHandler(
	{ transport, options: authToken }: RequestHandlerArgs<AuthToken, BasicSocketMapServer, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>
): Promise<void> {
	if (!allowedUsers[authToken.username]) {
		const err = new Error('Failed to login');
		err.name = 'FailedLoginError';
		throw err;
	}

	await transport.setAuthorization(authToken, { expiresIn: TEN_DAYS_IN_SECONDS });
}

async function loginWithTenDayExpHandler(
	{ transport, options: authToken }: RequestHandlerArgs<AuthToken, BasicSocketMapServer, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>
): Promise<void> {
	if (!allowedUsers[authToken.username]) {
		const err = new Error('Failed to login');
		err.name = 'FailedLoginError';
		throw err;
	}

	authToken.exp = Math.round(Date.now() / 1000) + TEN_DAYS_IN_SECONDS;

	await transport.setAuthorization(authToken);
}

async function loginWithTenDayExpAndExpiryHandler(
	{ transport, options: authToken }: RequestHandlerArgs<AuthToken, BasicSocketMapServer, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>
): Promise<void> {
	if (!allowedUsers[authToken.username]) {
		const err = new Error('Failed to login');
		err.name = 'FailedLoginError';
		throw err;
	}

	authToken.exp = Math.round(Date.now() / 1000) + TEN_DAYS_IN_SECONDS;

	await transport.setAuthorization(authToken, { expiresIn: TEN_DAYS_IN_SECONDS * 100 });
}

async function loginWithIssAndIssuerHandler(
	{ transport, options: authToken }: RequestHandlerArgs<AuthToken, BasicSocketMapServer, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>
): Promise<void> {
	if (!allowedUsers[authToken.username]) {
		const err = new Error('Failed to login');
		err.name = 'FailedLoginError';
		throw err;
	}

	authToken.iss = 'foo';

	await transport.setAuthorization(authToken, { issuer: 'bar' });
}

async function setAuthKeyHandler(
	{ transport, options: secret }: RequestHandlerArgs<jwt.Secret, BasicSocketMapServer>
): Promise<void> {
	const server = transport.state.server;

	server!.auth.signatureKey = secret;
	server!.auth.verificationKey = secret;
}

async function procHandler(
	{ options: data }: RequestHandlerArgs<number, BasicSocketMapServer>
): Promise<string> {
	return `success ${data}`;
}

const clientOptions: ClientSocketOptions<MyClientMap> = {
	authEngine: { authTokenName },
	address: `ws://127.0.0.1:${PORT_NUMBER}`,
	ackTimeoutMs: 200
}

const serverOptions: ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels>> = {
	authEngine: { authKey: SERVER_AUTH_KEY },
	ackTimeoutMs: 200,
	handlers: {
		login: loginHandler,
		loginWithTenDayExpiry: loginWithTenDayExpiryHandler,
		loginWithTenDayExp: loginWithTenDayExpHandler,
		loginWithTenDayExpAndExpiry: loginWithTenDayExpAndExpiryHandler,
		loginWithIssAndIssuer: loginWithIssAndIssuerHandler,
		setAuthKey: setAuthKeyHandler,
		proc: procHandler
	}
}

let client: ClientSocket<MyClientMap>;
let server: Server<BasicServerMap<ServerIncomingMap, MyChannels>>;

describe('Integration tests', function () {
	afterEach(async function () {
		if (client) {
			client.closeListeners();
			client.disconnect();
		}
		if (server) {
			server.closeListeners();
			server.httpServer.close();
			await server.close();
		}
		global.localStorage.removeItem(authTokenName);
	});

	describe('Client authentication', function () {
		beforeEach(async function () {
			server = listen(
				PORT_NUMBER,
				Object.assign(
					{
						middleware: [{
							onAuthenticate: (authInfo: AuthInfo) => {
								if (!('authToken' in authInfo) || authInfo.authToken.username === 'alice') {
									throw new MiddlewareBlockedError('Blocked by onAuthenticate', 'AuthenticateMiddlewareError');
								}
							}
						}]
					},
					serverOptions
				)
			);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);
		});

		it('Should not send back error if JWT is not provided in handshake', async function () {
			client = new ClientSocket(clientOptions);
			const event = await client.listen('connect').once(100);

			assert.strictEqual(event.isAuthenticated, false);
		});

		it('Should be authenticated on connect if previous JWT token is present', async function () {
			client = new ClientSocket(clientOptions);
			await client.listen('connect').once(100);
			client.invoke('login', {username: 'bob'});
			await client.listen('authenticate').once(100);
			assert.strictEqual(!!client.signedAuthToken, true);
			client.disconnect();
			client.connect();
			const event = await client.listen('connect').once(100);
			assert.strictEqual(event.isAuthenticated, true);
		});

		it('Should send back error if JWT is invalid during handshake', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);

			client = new ClientSocket(clientOptions);

			let event = await client.listen('connect').once();
			assert.strictEqual(event.isAuthenticated, true);
			// Change the setAuthKey to invalidate the current token.
			await client.invoke('setAuthKey', 'differentAuthKey');
			client.disconnect();
			client.connect();
			event = await client.listen('connect').once(100);
			assert.strictEqual(event.isAuthenticated, false);
			assert.notEqual(event.authError, null);
			assert.strictEqual(event.authError!.name, 'AuthTokenInvalidError');
		});

		it('Should allow switching between users', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);

			const authenticateEvents: AuthToken[] = [];
			const deauthenticateEvents: AuthToken[] = [];
			const authenticationStateChangeEvents: SocketAuthStateChangeEvent<BasicServerMap<ServerIncomingMap, MyChannels>>[] = [];
			const authStateChangeEvents: AuthStateChangeEvent[] = [];

			(async () => {
				for await (let stateChangePacket of server.listen('socketAuthStateChange')) {
					authenticationStateChangeEvents.push(stateChangePacket);
				}
			})();

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						for await (let {authToken} of socket.listen('authenticate')) {
							authenticateEvents.push(authToken);
						}
					})();
					(async () => {
						for await (let {authToken} of socket.listen('deauthenticate')) {
							deauthenticateEvents.push(authToken);
						}
					})();
					(async () => {
						for await (let stateChangeData of socket.listen('authStateChange')) {
							authStateChangeEvents.push(stateChangeData);
						}
					})();
				}
			})();

			let clientSocketId: string | null;

			client = new ClientSocket(clientOptions);
			await client.listen('connect').once();
			clientSocketId = client.id;
			client.invoke('login', {username: 'alice'});

			await wait(100);

			assert.strictEqual(deauthenticateEvents.length, 0);
			assert.strictEqual(authenticateEvents.length, 2);
			assert.strictEqual(authenticateEvents[0].username, 'bob');
			assert.strictEqual(authenticateEvents[1].username, 'alice');

			assert.strictEqual(authenticationStateChangeEvents.length, 2);
			assert.notEqual(authenticationStateChangeEvents[0].socket, null);
			assert.strictEqual(authenticationStateChangeEvents[0].socket.id, clientSocketId);
			assert.strictEqual(authenticationStateChangeEvents[0].wasAuthenticated, false);
			assert.strictEqual(authenticationStateChangeEvents[0].isAuthenticated, true);
			assert.notEqual(authenticationStateChangeEvents[0].authToken, null);
			assert.strictEqual(authenticationStateChangeEvents[0].authToken!.username, 'bob');
			assert.notEqual(authenticationStateChangeEvents[1].socket, null);
			assert.strictEqual(authenticationStateChangeEvents[1].socket.id, clientSocketId);
			assert.strictEqual(authenticationStateChangeEvents[1].wasAuthenticated, true);
			assert.strictEqual(authenticationStateChangeEvents[1].isAuthenticated, true);
			assert.notEqual(authenticationStateChangeEvents[1].authToken, null);
			assert.strictEqual(authenticationStateChangeEvents[1].authToken!.username, 'alice');

			assert.strictEqual(authStateChangeEvents.length, 2);
			assert.strictEqual(authStateChangeEvents[0].wasAuthenticated, false);
			assert.strictEqual(authStateChangeEvents[0].isAuthenticated, true);
			assert.notEqual(authStateChangeEvents[0].authToken, null);
			assert.strictEqual(authStateChangeEvents[0].authToken!.username, 'bob');
			assert.strictEqual(authStateChangeEvents[1].wasAuthenticated, true);
			assert.strictEqual(authStateChangeEvents[1].isAuthenticated, true);
			assert.notEqual(authStateChangeEvents[1].authToken, null);
			assert.strictEqual(authStateChangeEvents[1].authToken!.username, 'alice');
		});

		it('Should emit correct events/data when socket is deauthenticated', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);

			const authenticationStateChangeEvents: SocketAuthStateChangeEvent<BasicServerMap<ServerIncomingMap, MyChannels>>[] = [];
			const authStateChangeEvents: AuthStateChangeEvent[] = [];

			(async () => {
				for await (let stateChangePacket of server.listen('socketAuthStateChange')) {
					authenticationStateChangeEvents.push(stateChangePacket);
				}
			})();

			client = new ClientSocket(clientOptions);

			(async () => {
				for await (let event of client.listen('connect')) {
					client.deauthenticate();
				}
			})();

			const { socket } = await server.listen('socketConnect').once(100);
			const initialAuthToken = socket.authToken;

			(async () => {
				for await (let stateChangeData of socket.listen('authStateChange')) {
					authStateChangeEvents.push(stateChangeData);
				}
			})();

			const {authToken} = await socket.listen('deauthenticate').once(100);

			assert.strictEqual(authToken, initialAuthToken);

			assert.strictEqual(authStateChangeEvents.length, 2);
			assert.strictEqual(authStateChangeEvents[0].wasAuthenticated, false);
			assert.strictEqual(authStateChangeEvents[0].isAuthenticated, true);
			assert.notEqual(authStateChangeEvents[0].authToken, undefined);
			assert.strictEqual(authStateChangeEvents[0].authToken!.username, 'bob');
			assert.strictEqual(authStateChangeEvents[1].wasAuthenticated, true);
			assert.strictEqual(authStateChangeEvents[1].isAuthenticated, false);
			assert.strictEqual('authToken' in authStateChangeEvents[1], false);

			assert.strictEqual(authenticationStateChangeEvents.length, 2);
			assert.notEqual(authenticationStateChangeEvents[0], null);
			assert.strictEqual(authenticationStateChangeEvents[0].wasAuthenticated, false);
			assert.strictEqual(authenticationStateChangeEvents[0].isAuthenticated, true);
			assert.notEqual(authenticationStateChangeEvents[0].authToken, undefined);
			assert.strictEqual(authenticationStateChangeEvents[0].authToken!.username, 'bob');
			assert.notEqual(authenticationStateChangeEvents[1], null);
			assert.strictEqual((authenticationStateChangeEvents[1] as AuthenticatedChangeEvent).authToken, undefined);
			assert.strictEqual(authenticationStateChangeEvents[1].wasAuthenticated, true);
			assert.strictEqual(authenticationStateChangeEvents[1].isAuthenticated, false);
		});

		it('Should throw error if server socket deauthenticate is called after client disconnected and rejectOnFailedDelivery is true', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);

			client = new ClientSocket(clientOptions);

			const { socket } = await server.listen('connection').once(100);

			client.disconnect();
			let error: Error | null = null;
			try {
				await socket.deauthenticate(true);
			} catch (err) {
				error = err;
			}

			assert.notEqual(error, null);
			assert.strictEqual(error!.name, 'BadConnectionError');
		});

		it('Should not throw error if server socket deauthenticate is called after client disconnected and rejectOnFailedDelivery is not true', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);

			client = new ClientSocket(clientOptions);

			let { socket } = await server.listen('connection').once();

			client.disconnect();
			socket.deauthenticate();
		});

		it('Should not authenticate the client if MIDDLEWARE_INBOUND blocks the authentication', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenAlice);

			client = new ClientSocket(clientOptions);
			// The previous test authenticated us as 'alice', so that token will be passed to the server as
			// part of the handshake.
			const event = await client.listen('connect').once();
			// Any token containing the username 'alice' should be blocked by the MIDDLEWARE_INBOUND middleware.
			// This will only affects token-based authentication, not the credentials-based login event.
			assert.strictEqual(event.isAuthenticated, false);
			assert.notEqual(event.authError, null);
			assert.strictEqual((event.authError as MiddlewareBlockedError).type, 'AuthenticateMiddlewareError');
		});
	});

	describe('Server authentication', function () {
		it('Token should be available after the authenticate listener resolves', async function () {
			server = listen(PORT_NUMBER, serverOptions);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once();

			client.invoke('login', { username: 'bob' });
			await client.listen('authenticate').once(100);

			assert.strictEqual(!!client.signedAuthToken, true);
			assert.notEqual(client.authToken, null);
			assert.strictEqual(client.authToken!.username, 'bob');
		});

		it('Authentication can be captured using the authenticate listener', async function () {
			server = listen(PORT_NUMBER, serverOptions);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			client.invoke('login', { username: 'bob' });
			await client.listen('authenticate').once(100);

			assert.strictEqual(!!client.signedAuthToken, true);
			assert.notEqual(client.authToken, null);
			assert.strictEqual(client.authToken!.username, 'bob');
		});

		it('Previously authenticated client should still be authenticated after reconnecting', async function () {
			server = listen(PORT_NUMBER, serverOptions);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			client.invoke('login', {username: 'bob'});

			await client.listen('authenticate').once(100);

			client.disconnect();
			client.connect();

			const event = await client.listen('connect').once(100);

			assert.strictEqual(event.isAuthenticated, true);
			assert.notEqual(client.authToken, null);
			assert.strictEqual(client.authToken!.username, 'bob');
		});

		it('Should set the correct expiry when using expiresIn option when creating a JWT with socket.setAuthToken', async function () {
			server = listen(PORT_NUMBER, serverOptions);

			bindFailureHandlers(server);

			await server.listen('ready').once();

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);
			client.invoke('loginWithTenDayExpiry', {username: 'bob'});
			await client.listen('authenticate').once(100);

			assert.notEqual(client.authToken, null);
			assert.notEqual(client.authToken!.exp, null);

			const dateMillisecondsInTenDays = Date.now() + TEN_DAYS_IN_SECONDS * 1000;
			const dateDifference = Math.abs(dateMillisecondsInTenDays - client.authToken!.exp! * 1000);

			// Expiry must be accurate within 1000 milliseconds.
			assert.strictEqual(dateDifference < 1000, true);
		});

		it('Should set the correct expiry when adding exp claim when creating a JWT with socket.setAuthToken', async function () {
			server = listen(PORT_NUMBER, serverOptions);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once();
			client.invoke('loginWithTenDayExp', {username: 'bob'});
			await client.listen('authenticate').once();

			assert.notEqual(client.authToken, null);
			assert.notEqual(client.authToken!.exp, null);

			const dateMillisecondsInTenDays = Date.now() + TEN_DAYS_IN_SECONDS * 1000;
			const dateDifference = Math.abs(dateMillisecondsInTenDays - client.authToken!.exp! * 1000);

			// Expiry must be accurate within 1000 milliseconds.
			assert.strictEqual(dateDifference < 1000, true);
		});

		it('The exp claim should have priority over expiresIn option when using socket.setAuthToken', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);
			client.invoke('loginWithTenDayExpAndExpiry', { username: 'bob' });
			await client.listen('authenticate').once(100);

			assert.notEqual(client.authToken, null);
			assert.notEqual(client.authToken!.exp, null);

			let dateMillisecondsInTenDays = Date.now() + TEN_DAYS_IN_SECONDS * 1000;
			let dateDifference = Math.abs(dateMillisecondsInTenDays - client.authToken!.exp! * 1000);

			// Expiry must be accurate within 1000 milliseconds.
			assert.strictEqual(dateDifference < 1000, true);
		});

		it('Should send back error if socket.setAuthToken tries to set both iss claim and issuer option', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			const warningMap: {[name: string]: Error} = {};

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			(async () => {
				await client.listen('authenticate').once();
				throw new Error('Should not pass authentication because the signature should fail');
			})();

			(async () => {
				for await (let {error} of server.listen('socketError')) {
					assert.notEqual(error, null);
					warningMap[error.name] = error;
				}
			})();

			(async () => {
				for await (let {error} of server.listen('error')) {
					assert.notEqual(error, null);
					assert.strictEqual(error.name, 'SocketProtocolError');
				}
			})();

			const closePackets: CloseEvent[] = [];

			(async () => {
				const event = await client.listen('close').once(100);
				closePackets.push(event);
			})();

			let error: Error | null = null;

			try {
				await client.invoke('loginWithIssAndIssuer', { username: 'bob' });
			} catch (err) {
				error = err;
			}

			assert.notEqual(error, null);
			assert.strictEqual(error!.name, 'BadConnectionError');

			await wait(0);

			assert.strictEqual(closePackets.length, 1);
			assert.strictEqual(closePackets[0].code, 4002);
			server.closeListeners('socketError');
			assert.notEqual(warningMap['SocketProtocolError'], null);
		});

		it('Should trigger an authTokenSigned event and socket.signedAuthToken should be set after calling the socket.setAuthToken method', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			let authTokenSignedEventEmitted = false;

			(async () => {
				for await (let { socket, wasSigned, signedAuthToken } of server.listen('socketAuthenticate')) {
					if (wasSigned) {
						authTokenSignedEventEmitted = true;
						assert.notEqual(signedAuthToken, null);
						assert.strictEqual(signedAuthToken, socket.signedAuthToken);
					}
				}
			})();

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			await Promise.all([
				client.invoke('login', { username: 'bob' }),
				client.listen('authenticate').once(100)
			]);

			assert.strictEqual(authTokenSignedEventEmitted, true);
		});

		it('The socket.setAuthToken call should reject if token delivery fails and rejectOnFailedDelivery option is true', async () => {
			let resolve: () => void;
			let reject: (err: Error) => void;

			server = listen(
				PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						handlers: {
							login: async ({ socket, transport, options: authToken }: RequestHandlerArgs<AuthToken, BasicSocketMapServer, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>) => {
								if (!allowedUsers[authToken.username]) {
									const err = new Error('Failed to login');
									err.name = 'FailedLoginError';
									throw err;
								}

								(async () => {
									await wait(0);

									let error: Error | null = null;
	
									try {
										socket.disconnect();
										await transport.setAuthorization(authToken, { rejectOnFailedDelivery: true });
									} catch (err) {
										error = err;
									}
	
									try {
										assert.notEqual(error, null);
										assert.strictEqual(error!.name, 'AuthError');

										await wait(0);
										
										assert.notEqual(serverWarnings[0], null);
										assert.strictEqual(serverWarnings[0].name, 'BadConnectionError');
										assert.notEqual(serverWarnings[1], null);
										assert.strictEqual(serverWarnings[1].name, 'AuthError');
										resolve();
									} catch (err) {
										reject(err);
									}	
								})();								
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			const serverWarnings: Error[] = [];

			(async () => {
				for await (let { error } of server.listen('socketError')) {
					serverWarnings.push(error);
				}
			})();

			await server.listen('ready').once(100);
			client = new ClientSocket(clientOptions);
			await client.listen('connect').once(100);
			await client.invoke('login', { username: 'bob' });

			await new Promise<void>((resolveFn, rejectFn) => {
				resolve = resolveFn;
				reject = rejectFn;
			});
		});

	});
});