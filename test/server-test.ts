import { afterEach, beforeEach, describe, it } from "node:test";
import { ClientSocketOptions } from "../src/client/client-socket-options";
import { ClientSocket } from "../src/client/client-socket";
import { Server, ServerSocket, listen } from "../src";
import { BasicServerMap } from "../src/client/maps/server-map";
import { ServerOptions } from "../src/server/server-options";
import { AuthToken } from "@socket-mesh/auth";
import { RequestHandlerArgs } from "../src/request-handler";
import jwt from "jsonwebtoken";
import { BasicSocketMapServer, SocketMapFromClient, SocketMapFromServer } from "../src/client/maps/socket-map";
import { ServerTransport } from "../src/server/server-transport";
import { AuthInfo } from "../src/server/handlers/authenticate";
import assert from "node:assert";
import localStorage from '@socket-mesh/local-storage';
import { wait } from "../src/utils";
import { AuthStateChangeEvent, AuthenticatedChangeEvent, CloseEvent, ConnectEvent } from "../src/socket-event";
import { ConnectionEvent, SocketAuthStateChangeEvent } from "../src/server/server-event";
import { MiddlewareBlockedError } from "@socket-mesh/errors";
import { AuthOptions } from "../src/server/auth-engine";
import { OfflineMiddleware } from "../src/middleware/offline-middleware";
import { InOrderMiddleware } from "../src/middleware/in-order-middleware";
import { MiddlewareArgs, SendRequestMiddlewareArgs } from "../src/middleware/middleware";
import { AnyRequest } from "../src/request";
import { isRequestPacket } from "../src/packet";
import { isPublishOptions } from "../src/channels/channels";
import { WritableConsumableStream } from "@socket-mesh/writable-consumable-stream";

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

type CustomProcArgs = { good: true } | { bad: true };

type ClientIncomingMap = {
	bla:(num: number) => void,
	hi: (num: number) => void
}

type ServerIncomingMap = {
	customProc:(args: CustomProcArgs) => string,
	customRemoteEvent:(str: string) => void,
	foo:(num: number) => string,
	greeting: () => void,
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

function bindFailureHandlers(server: Server<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>) {
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

	server!.auth.authKey = secret;
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

const serverOptions: ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>> = {
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
let server: Server<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>;

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
			const authenticationStateChangeEvents: SocketAuthStateChangeEvent<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>[] = [];
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

			const authenticationStateChangeEvents: SocketAuthStateChangeEvent<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>[] = [];
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

		it('Should send back error if socket.setAuthToken tries to set both iss claim and issuer option', async function() {
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

		it('Should trigger an authTokenSigned event and socket.signedAuthToken should be set after calling the socket.setAuthToken method', async function() {
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

		it('The socket.setAuthToken call should reject if token delivery fails and rejectOnFailedDelivery option is true', async function() {
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

		it('The socket.setAuthToken call should not reject if token delivery fails and rejectOnFailedDelivery option is not true', async function () {
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
										await transport.setAuthorization(authToken);
									} catch (err) {
										error = err;
									}
	
									try {
										assert.strictEqual(error, null);
										await wait(0);
										assert.notEqual(serverWarnings[0], null);
										assert.strictEqual(serverWarnings[0].name, 'BadConnectionError');

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

		it('The verifyToken method of the authEngine receives correct params', async function () {
			let resolve: () => void;
			let reject: (err: Error) => void;

			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);

			server = listen(PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						authEngine: {
							authKey: SERVER_AUTH_KEY,
							signToken: async() => {
								return '';
							},
							verifyToken: async (signedToken: string, authOptions: AuthOptions, verifyOptions?: jwt.VerifyOptions) => {
								try {
									await wait(10);
									assert.strictEqual(signedToken, validSignedAuthTokenBob);
									assert.strictEqual(authOptions.authKey, SERVER_AUTH_KEY);
									//assert.notEqual(verifyOptions, null);
									//assert.notEqual(options.socket, null);
								} catch (err) {
									reject(err);
								}
								resolve();
								return {};
							}
						}
					}
				)
			);
			bindFailureHandlers(server);

			(async () => {
				await server.listen('ready').once(100);
				client = new ClientSocket(clientOptions);
			})();

			await new Promise<void>((resolveFn, rejectFn) => {
				resolve = resolveFn;
				reject = rejectFn;
			});
		});

		it('Should remove client data from the server when client disconnects before authentication process finished', async function () {
			server = listen(PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						authEngine: {
							authKey: SERVER_AUTH_KEY,
							signToken: async() => {
								return '';
							},
							verifyToken: async () => {
								await wait(500);
								return {};
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			let serverSocket: ServerSocket<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>> | null = null;

			(async () => {
				for await (let {socket} of server.listen('handshake')) {
					serverSocket = socket;
				}
			})();

			await wait(100);
			assert.strictEqual(server.clientCount, 0);
			assert.strictEqual(server.pendingClientCount, 1);
			assert.notEqual(serverSocket, null);
			assert.strictEqual(Object.keys(server.pendingClients)[0], serverSocket!.id);
			client.disconnect();

			await wait(100);
			assert.strictEqual(Object.keys(server.clients).length, 0);
			assert.strictEqual(server.clientCount, 0);
			assert.strictEqual(server.pendingClientCount, 0);
			assert.strictEqual(JSON.stringify(server.pendingClients), '{}');
		});

		it('Should close the connection if the client tries to send a malformatted authenticate packet', async function () {
			server = listen(PORT_NUMBER, serverOptions);

			await server.listen('ready').once();

			client = new ClientSocket(
				Object.assign(
					{},
					clientOptions,
					{
						autoConnect: false,
						middleware: [
							new OfflineMiddleware(),
							{
								type: 'Authenticate Interceptor',
								sendRequest: ({ requests, cont }: SendRequestMiddlewareArgs<SocketMapFromClient<MyClientMap>>) => {
									cont(
										requests.map(
											req => {
												if (req.method === '#authenticate' && 'cid' in req) {
													delete (req as any).cid;
												}

												return req;
											}
										)
									);
								}
							}
						]
					}
				)
			);

			const results = await Promise.allSettled([
				server.listen('socketClose').once(100),
				client.listen('close').once(100),
				client.authenticate(validSignedAuthTokenBob)
			]);

			assert.strictEqual(results[0].status, 'fulfilled');
			assert.strictEqual(results[0].value.code, 4008);
			assert.strictEqual(results[0].value.reason, 'Server rejected handshake from client');
			assert.strictEqual(results[1].status, 'fulfilled');
			assert.strictEqual(results[1].value.code, 4008);
			assert.strictEqual(results[1].value.reason, 'Server rejected handshake from client');
			assert.strictEqual(results[2].status, 'rejected');
			assert.strictEqual(results[2].reason.name, 'BadConnectionError');
		});
	});

	describe('Socket handshake', function () {
		it('Exchange is attached to socket before the handshake event is triggered', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			const { socket } = await server.listen('handshake').once(100);

			assert.notEqual(socket.exchange, null);
		});

		it('Should close the connection if the client tries to send a message before the handshake', async function () {
			server = listen(PORT_NUMBER, serverOptions);

			await server.listen('ready').once(100);

			client = new ClientSocket(
				Object.assign(
					{
						middleware: [{
							onOpen({ transport }: MiddlewareArgs<SocketMapFromClient<MyClientMap>>) {
								transport.send(Buffer.alloc(0));
							}
						}]
					},
					clientOptions
				)
			);

			const results = await Promise.all([
				server.listen('socketClose').once(2000),
				client.listen('close').once(2000)
			]);

			assert.strictEqual(results[0].code, 4009);
			assert.strictEqual(results[0].reason, 'Server received a message before the client handshake');
			assert.strictEqual(results[1].code, 4009);
			assert.strictEqual(results[1].reason, 'Server received a message before the client handshake');
		});

		it('Should close the connection if the client tries to send a ping before the handshake', async function () {
			server = listen(PORT_NUMBER, serverOptions);

			await server.listen('ready').once(100);

			client = new ClientSocket(
				Object.assign(
					{
						middleware: [{
							onOpen({ transport }: MiddlewareArgs<SocketMapFromClient<MyClientMap>>) {
								transport.ping();
							}
						}]
					},
					clientOptions
				)
			);

			const { code: closeCode } = await client.listen('close').once(100);

			assert.strictEqual(closeCode, 4009);
		});

		it('Should not close the connection if the client tries to send a message before the handshake and strictHandshake is false', async function () {
			server = listen(PORT_NUMBER,
				Object.assign(
					{ strictHandshake: false },
					serverOptions
				)
			);

			await server.listen('ready').once(100);

			client = new ClientSocket(
				Object.assign(
					{
						middleware: [{
							onOpen({ transport }: MiddlewareArgs<SocketMapFromClient<MyClientMap>>) {
								transport.send(Buffer.alloc(0));
							}
						}]
					},
					clientOptions
				)
			);

			const packet = await client.listen('connect').once(100);

			assert.notEqual(packet, null);
			assert.notEqual(packet.id, null);
		});
	});

	describe('Socket connection', function () {
		it('Server-side socket connect event and server connection event should trigger', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			let connectionEvent: ConnectEvent | null = null;

			(async () => {
				for await (let event of server.listen('socketConnect')) {
					connectionEvent = event;
					// This is to check that mutating the status on the server
					// doesn't affect the status sent to the client.
					(connectionEvent as any).foo = 123;
				}
			})();

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			let connectStatus: ConnectEvent | null = null;
			let socketId: string | null = null;

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						for await (let serverSocketStatus of socket.listen('connect')) {
							socketId = socket.id;
							connectStatus = serverSocketStatus;
							// This is to check that mutating the status on the server
							// doesn't affect the status sent to the client.
							(serverSocketStatus as any).foo = 456;
						}
					})();
				}
			})();

			let clientConnectStatus: ConnectEvent | null = null;

			(async () => {
				for await (let event of client.listen('connect')) {
					clientConnectStatus = event;
				}
			})();

			await wait(100);

			assert.notEqual(connectionEvent, null);
			assert.strictEqual(connectionEvent!.id, socketId);
			assert.strictEqual(connectionEvent!.pingTimeoutMs, server.pingTimeoutMs);
			assert.strictEqual(connectionEvent!.authError, undefined);
			assert.strictEqual(connectionEvent!.isAuthenticated, false);

			assert.notEqual(connectStatus, null);
			assert.strictEqual(connectStatus!.id, socketId);
			assert.strictEqual(connectStatus!.pingTimeoutMs, server.pingTimeoutMs);
			assert.strictEqual(connectStatus!.authError, undefined);
			assert.strictEqual(connectStatus!.isAuthenticated, false);

			assert.notEqual(clientConnectStatus, null);
			assert.strictEqual(clientConnectStatus!.id, socketId);
			assert.strictEqual(clientConnectStatus!.pingTimeoutMs, server.pingTimeoutMs);
			assert.strictEqual(clientConnectStatus!.authError, undefined);
			assert.strictEqual(clientConnectStatus!.isAuthenticated, false);
			assert.strictEqual((clientConnectStatus as any).foo, undefined);
			// Client socket status should be a clone of server socket status; not
			// a reference to the same object.
			assert.notEqual((clientConnectStatus as any).foo, (connectStatus as any).foo);
		});

		it('Server-side connection event should trigger with large number of concurrent connections', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			const connectionList: ConnectionEvent<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>[] = [];

			(async () => {
				for await (let event of server.listen('connection')) {
					connectionList.push(event);
				}
			})();

			await server.listen('ready').once();

			const clientList: ClientSocket<MyClientMap>[] = [];
			let client: ClientSocket<MyClientMap>;

			for (let i = 0; i < 100; i++) {
				client = new ClientSocket(clientOptions);
				clientList.push(client);
			}

			await wait(100);

			assert.strictEqual(connectionList.length, 100);

			for (let client of clientList) {
				client.disconnect();
			}

			await wait(100);
		});

		it('Server should support large a number of connections invoking procedures concurrently immediately upon connect', async function () {
			let connectionCount = 0;
			let requestCount = 0;

			server = listen(
				PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						handlers: {
							greeting: async function (): Promise<void> {
								requestCount++;
								await wait(1);
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			(async () => {
				for await (let {} of server.listen('connection')) {
					connectionCount++;
				}
			})();

			await server.listen('ready').once();

			const clientList: ClientSocket<MyClientMap>[] = [];
			let client: ClientSocket<MyClientMap>;

			for (let i = 0; i < 100; i++) {
				client = new ClientSocket(
					Object.assign(
						{},
						clientOptions,
						{
							middleware: [new OfflineMiddleware()]
						}
					)
				);
				clientList.push(client);
				await client.invoke('greeting');
			}

			await wait(10);

			assert.strictEqual(requestCount, 100);
			assert.strictEqual(connectionCount, 100);

			for (let client of clientList) {
				client.disconnect();
			}
			await wait(100);
		});
	});

	describe('Socket disconnection', function () {
		it('Server-side socket disconnect event should not trigger if the socket did not complete the handshake; instead, it should trigger connectAbort', async function () {
			server = listen(PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						authEngine: {
							authKey: SERVER_AUTH_KEY,
							signToken: async() => {
								return '';
							},
							verifyToken: async () => {
								await wait(100);
								return {};
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			let connectionOnServer = false;

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					connectionOnServer = true;
				}
			})();

			await server.listen('ready').once();

			client = new ClientSocket(clientOptions);

			let socketDisconnected = false;
			let socketDisconnectedBeforeConnect = false;
			let clientSocketAborted = false;

			(async () => {
				const {socket} = await server.listen('handshake').once();
				assert.strictEqual(server.pendingClientCount, 1);
				assert.notEqual(server.pendingClients[socket.id], null);

				(async () => {
					await socket.listen('disconnect').once();
					if (!connectionOnServer) {
						socketDisconnectedBeforeConnect = true;
					}
					socketDisconnected = true;
				})();

				(async () => {
					const event = await socket.listen('connectAbort').once();
					clientSocketAborted = true;

					assert.strictEqual(event.code, 4444);
					assert.strictEqual(event.reason, 'Disconnect before handshake');
				})();
			})();

			let serverDisconnected = false;
			let serverSocketAborted = false;

			(async () => {
				await server.listen('socketDisconnect').once();
				serverDisconnected = true;
			})();

			(async () => {
				await server.listen('socketConnectAbort').once(200);
				serverSocketAborted = true;
			})();

			await wait(10);
			client.disconnect(4444, 'Disconnect before handshake');

			await wait(300);

			assert.strictEqual(socketDisconnected, false);
			assert.strictEqual(socketDisconnectedBeforeConnect, false);
			assert.strictEqual(clientSocketAborted, true);
			assert.strictEqual(serverSocketAborted, true);
			assert.strictEqual(serverDisconnected, false);
		});

		it('Server-side socket disconnect event should trigger if the socket completed the handshake (not connectAbort)', async function () {
			server = listen(PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						authEngine: {
							authKey: SERVER_AUTH_KEY,
							signToken: async() => {
								return '';
							},
							verifyToken: async () => {
								await wait(10);
								return {};
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			let connectionOnServer = false;

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					connectionOnServer = true;
				}
			})();

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			let socketDisconnected = false;
			let socketDisconnectedBeforeConnect = false;
			let clientSocketAborted = false;

			(async () => {
				let {socket} = await server.listen('handshake').once();
				assert.strictEqual(server.pendingClientCount, 1);
				assert.notEqual(server.pendingClients[socket.id], null);

				(async () => {
					let event = await socket.listen('disconnect').once();
					if (!connectionOnServer) {
						socketDisconnectedBeforeConnect = true;
					}
					socketDisconnected = true;
					assert.strictEqual(event.code, 4445);
					assert.strictEqual(event.reason, 'Disconnect after handshake');
				})();

				(async () => {
					let event = await socket.listen('connectAbort').once();
					clientSocketAborted = true;
				})();
			})();

			let serverDisconnected = false;
			let serverSocketAborted = false;

			(async () => {
				await server.listen('socketDisconnect').once();
				serverDisconnected = true;
			})();

			(async () => {
				await server.listen('socketConnectAbort').once();
				serverSocketAborted = true;
			})();

			await wait(30);
			client.disconnect(4445, 'Disconnect after handshake');

			await wait(100);

			assert.strictEqual(socketDisconnectedBeforeConnect, false);
			assert.strictEqual(socketDisconnected, true);
			assert.strictEqual(clientSocketAborted, false);
			assert.strictEqual(serverDisconnected, true);
			assert.strictEqual(serverSocketAborted, false);
		});

		it('The close event should trigger when the socket loses the connection before the handshake', async function () {
			server = listen(PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						authEngine: {
							authKey: SERVER_AUTH_KEY,
							signToken: async() => {
								return '';
							},
							verifyToken: async () => {
								await wait(100);
								return {};
							}
						}
					}
				)
			);
			
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			let serverSocketClosed = false;
			let serverSocketAborted = false;
			let serverClosure = false;

			(async () => {
				for await (let {socket} of server.listen('handshake')) {
					let event = await socket.listen('close').once();
					serverSocketClosed = true;
					assert.strictEqual(event.code, 4444);
					assert.strictEqual(event.reason, 'Disconnect before handshake');
				}
			})();

			(async () => {
				for await (let event of server.listen('socketConnectAbort')) {
					serverSocketAborted = true;
				}
			})();

			(async () => {
				for await (let event of server.listen('socketClose')) {
					assert.strictEqual(event.socket.status, 'closed');
					serverClosure = true;
				}
			})();

			await wait(50);
			client.disconnect(4444, 'Disconnect before handshake');

			await wait(300);
			assert.strictEqual(serverSocketClosed, true);
			assert.strictEqual(serverSocketAborted, true);
			assert.strictEqual(serverClosure, true);
		});

		it('The close event should trigger when the socket loses the connection after the handshake', async function () {
			server = listen(PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						authEngine: {
							authKey: SERVER_AUTH_KEY,
							signToken: async() => {
								return '';
							},
							verifyToken: async () => {
								await wait(0);
								return {};
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			let serverSocketClosed = false;
			let serverDisconnection = false;
			let serverClosure = false;

			(async () => {
				for await (let {socket} of server.listen('handshake')) {
					let event = await socket.listen('close').once();
					serverSocketClosed = true;
					assert.strictEqual(event.code, 4445);
					assert.strictEqual(event.reason, 'Disconnect after handshake');
				}
			})();

			(async () => {
				for await (let event of server.listen('socketDisconnect')) {
					serverDisconnection = true;
				}
			})();

			(async () => {
				for await (let event of server.listen('socketClose')) {
					assert.strictEqual(event.socket.status, 'closed');
					serverClosure = true;
				}
			})();

			await wait(100);
			client.disconnect(4445, 'Disconnect after handshake');

			await wait(300);
			assert.strictEqual(serverSocketClosed, true);
			assert.strictEqual(serverDisconnection, true);
			assert.strictEqual(serverClosure, true);
		});

		it('Disconnection should support socket message backpressure', async function () {
			let currentRequestData: number | null = null;
			let requestDataAtTimeOfDisconnect: number | null = null;

			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>>(
					{},
					serverOptions,
					{
						handlers: {
							foo: async ({ socket, options: data }: RequestHandlerArgs<number, BasicSocketMapServer<{}, {}, {}, ClientIncomingMap>>) => {
								currentRequestData = data;
								await wait(10);
								(async () => {
									try {
										await socket.invoke('bla', data);
									} catch (err) {}
								})();

								try {
									await socket.transmit('hi', data);	
								} catch (err) {}

								if (data === 10) {
									client.disconnect();
								}

								return 'bar';
							}
						},
						middleware: [new InOrderMiddleware()]
					}
				)
			);

			bindFailureHandlers(server);

			const serverWarnings: Error[] = [];
			(async () => {
				for await (let {error} of server.listen('socketError')) {
					serverWarnings.push(error);
				}
			})();

			await server.listen('ready').once(100);

			client = new ClientSocket(
				Object.assign(
					{},
					clientOptions,
					{
						middleware: [new OfflineMiddleware()]
					}
				)
			);

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						await socket.listen('disconnect').once();
						requestDataAtTimeOfDisconnect = currentRequestData;
					})();
				}
			})();

			for (let i = 0; i < 30; i++) {
				(async () => {
					try {
						await client.invoke('foo', i);
					} catch (error) {
						return;
					}
				})();
			}

			await wait(600);

			// Expect a server warning (socket error) if a response was sent on a disconnected socket.
			assert.strictEqual(
				serverWarnings.some((warning) => {
					return warning.message.match(/WebSocket is not open/g);
				}), 
				true
			);

			// Expect a server warning (socket error) if transmit was called on a disconnected socket.
			assert.strictEqual(
				serverWarnings.some((warning) => {
					return warning.name === 'BadConnectionError' && warning.message.match(/Socket transmit hi event was aborted/g);
				}), 
				true
			);

			// Expect a server warning (socket error) if invoke was called on a disconnected socket.
			assert.strictEqual(
				serverWarnings.some((warning) => {
					return warning.name === 'BadConnectionError' && warning.message.match(/Socket invoke bla event was aborted/g);
				}), 
				true
			);

			// Check that the disconnect event on the back end socket triggers as soon as possible (out-of-band) and not at the end of the stream.
			// Any value less than 30 indicates that the 'disconnect' event was triggerred out-of-band.
			// Since the client disconnect() call is executed on the 11th message, we can assume that the 'disconnect' event will trigger sooner.
			assert.strictEqual(requestDataAtTimeOfDisconnect != null && requestDataAtTimeOfDisconnect < 15, true);
		});

		it('Socket streams should be killed immediately if socket disconnects (default/kill mode)', async function () {
			const handledPackets: number[] = [];
			let closedReceiver = false;

			server = listen(
				PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						handlers: {
							foo: async ({ options: data }: RequestHandlerArgs<number, BasicSocketMapServer<{}, {}, {}, ClientIncomingMap>>) => {
								await wait(30);
								handledPackets.push(data);	
							}
						},
						middleware: [new InOrderMiddleware()]
					}
				)
			);
			
			bindFailureHandlers(server);

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						for await (let packet of socket.listen()) {}
						closedReceiver = true;
					})();
				}
			})();

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await wait(100);

			for (let i = 0; i < 15; i++) {
				client.transmit('foo', i);
			}

			await wait(100);

			client.disconnect(4445, 'Disconnect');

			await wait(400);

			assert.strictEqual(handledPackets.length, 4);
			assert.strictEqual(closedReceiver, true);
		});

		it('Socket streams should be closed eventually if socket disconnects (close mode)', async function () {
			let handledPackets: number[] = [];
			let closedReceiver = false;

			server = listen(
				PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						socketStreamCleanupMode: 'close',
						handlers: {
							foo: async ({ options: data }: RequestHandlerArgs<number, BasicSocketMapServer<{}, {}, {}, ClientIncomingMap>>) => {
								await wait(30);
								handledPackets.push(data);	
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						for await (let packet of socket.listen()) {
						}
						closedReceiver = true;
					})();
				}
			})();

			await server.listen('ready').once();

			client = new ClientSocket(clientOptions);

			await wait(100);

			for (let i = 0; i < 15; i++) {
				client.transmit('foo', i);
			}

			await wait(110);

			client.disconnect(4445, 'Disconnect');

			await wait(400);
			assert.strictEqual(handledPackets.length, 15);
			assert.strictEqual(closedReceiver, true);
		});

		it('Socket streams should be closed eventually if socket disconnects (none mode)', async function () {
			let handledPackets: number[] = [];
			let closedReceiver = false;

			server = listen(
				PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						socketStreamCleanupMode: 'none',
						handlers: {
							foo: async ({ options: data }: RequestHandlerArgs<number, BasicSocketMapServer<{}, {}, {}, ClientIncomingMap>>) => {
								await wait(30);
								handledPackets.push(data);	
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						for await (let packet of socket.listen()) {}
						closedReceiver = false;
					})();
				}
			})();

			await server.listen('ready').once();

			client = new ClientSocket(clientOptions);

			await wait(100);

			for (let i = 0; i < 15; i++) {
				client.transmit('foo', i);
			}

			await wait(130);

			client.disconnect(4445, 'Disconnect');

			await wait(400);
			assert.strictEqual(handledPackets.length, 15);
			assert.strictEqual(closedReceiver, false);
		});
	});

	describe('Socket RPC invoke', function () {
		it ('Should support invoking a remote procedure on the server', async function () {
			server = listen(
				PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						handlers: {
							customProc: async ({ options }: RequestHandlerArgs<CustomProcArgs, BasicSocketMapServer<{}, {}, {}, ClientIncomingMap>>) => {
								if ('bad' in options) {
									const err = new Error('Server failed to execute the procedure');
									err.name = 'BadCustomError';
									throw err;
								}

								return 'Success';
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			client = new ClientSocket(
				Object.assign(
					{},
					clientOptions,
					{
						middleware: [new OfflineMiddleware()]
					}
				)
			);

			let result = await client.invoke('customProc', {good: true});

			assert.strictEqual(result, 'Success');

			let error: Error | null = null;
			try {
				result = await client.invoke('customProc', {bad: true});
			} catch (err) {
				error = err;
			}
			assert.notEqual(error, null);
			assert.strictEqual(error!.name, 'BadCustomError');
		});
	});

	describe('Socket transmit', function () {
		it ('Should support receiving remote transmitted data on the server', function (context, done) {
			server = listen(
				PORT_NUMBER,
				Object.assign(
					{},
					serverOptions,
					{
						handlers: {
							customRemoteEvent: async ({ options: data }: RequestHandlerArgs<string, BasicSocketMapServer<{}, {}, {}, ClientIncomingMap>>) => {
								assert.strictEqual(data, 'This is data');
								done();
							}
						}
					}
				)
			);

			bindFailureHandlers(server);

			(async () => {
				await wait(10);

				client = new ClientSocket(
					Object.assign(
						{},
						clientOptions,
						{
							middleware: [new OfflineMiddleware()]
						}
					)
				);
				await client.transmit('customRemoteEvent', 'This is data');
			})();
		});
	});

	describe('Socket backpressure', function () {
		it('Should be able to getInboundBackpressure() on a socket object', async function () {
			const backpressureHistory: number[] = [];
			
			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>>(
					{
						middleware: [
							{
								type: 'Message Interceptor',
								async onMessageRaw({ socket, message }) {
									backpressureHistory.push(socket.getInboundBackpressure());
	
									return message;
								},
								async onMessage({ packet }) {
									if (isRequestPacket(packet) && isPublishOptions(packet.data) && packet.data.data === 5) {
										await wait(140);
									}
	
									return packet;
								}
							},
							new InOrderMiddleware()
						]
					},
					serverOptions
				)
			);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			for (let i = 0; i < 20; i++) {
				await wait(10);
				client.channels.transmitPublish('foo', i);
			}

			await wait(250);

			// Backpressure should go up and come back down.
			assert.strictEqual(backpressureHistory.length, 21);
			assert.strictEqual(backpressureHistory[0], 1);
			assert.strictEqual(backpressureHistory[12] > 4, true);
			assert.strictEqual(backpressureHistory[14] > 6, true);
			assert.strictEqual(backpressureHistory[19], 1);
		});

		it('Should be able to getOutboundBackpressure() on a socket object', async function () {
			const backpressureHistory: number[] = [];
			const requestStream = 
				new WritableConsumableStream<SendRequestMiddlewareArgs<SocketMapFromServer<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>>>();

			(async () => {
				for await (let { requests, cont } of requestStream) {
					if (isPublishOptions(requests[0].data) && requests[0].data.data === 5) {
						await wait(140);
					}

					cont(requests);
				}
			})();

			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>>(
					{
						middleware: [
							{
								type: 'Send Request Interceptor',
								sendRequest(options) {
									requestStream.write(options);
								}
							}
						]
					},
					serverOptions
				)
			);

			bindFailureHandlers(server);

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						await socket.exchange.listen('subscribe').once(100);

						for (let i = 0; i < 20; i++) {
							await wait(10);
							server.exchange.transmitPublish('foo', i);
							backpressureHistory.push(socket.getOutboundBackpressure());
						}
					})();
				}
			})();

			await server.listen('ready').once(100);

			client = new ClientSocket(
				Object.assign(
					{
						middleware: [
							new OfflineMiddleware()
						]
					},
					clientOptions
				)
			);

			await client.channels.subscribe('foo').listen('subscribe').once(100);

			await wait(400);

			// Backpressure should go up and come back down.
			assert.strictEqual(backpressureHistory.length, 20);
			assert.strictEqual(backpressureHistory[0], 1);
			assert.strictEqual(backpressureHistory[13] > 7, true);
			assert.strictEqual(backpressureHistory[14] > 8, true);
			assert.strictEqual(backpressureHistory[19], 1);
		});

		it('Should be able to getBackpressure() on a socket object and it should be the highest backpressure', async function () {
			const backpressureHistory: number[] = [];
			
			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>>(
					{
						middleware: [
							{
								type: 'Message Interceptor',
								async onMessageRaw({ socket, message }) {
									backpressureHistory.push(socket.getBackpressure());
	
									return message;
								},
								async onMessage({ packet }) {
									if (isRequestPacket(packet) && isPublishOptions(packet.data) && packet.data.data === 5) {
										await wait(140);
									}
	
									return packet;
								}
							},
							new InOrderMiddleware()
						]
					},
					serverOptions
				)
			);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			for (let i = 0; i < 20; i++) {
				await wait(10);
				client.channels.transmitPublish('foo', i);
			}

			await wait(400);

			// Backpressure should go up and come back down.
			assert.strictEqual(backpressureHistory.length, 21);
			assert.strictEqual(backpressureHistory[0], 1);
			assert.strictEqual(backpressureHistory[12] > 4, true);
			assert.strictEqual(backpressureHistory[14] > 6, true);
			assert.strictEqual(backpressureHistory[19], 1);
		});
	});
/*
	describe('Socket pub/sub', function () {
		it('Should maintain order of publish and subscribe', async function () {
			server = listen(PORT_NUMBER, {
				authKey: serverOptions.authKey
//        wsEngine: WS_ENGINE
			});
			bindFailureHandlers(server);

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					connectionHandler(socket);
				}
			})();

			await server.listen('ready').once();

			client = create({
				hostname: clientOptions.hostname,
				port: PORT_NUMBER,
				authTokenName: 'socketcluster.authToken'
			});

			await client.listen('connect').once();

			let receivedMessages: unknown[] = [];

			(async () => {
				for await (let data of client.subscribe('foo')) {
					receivedMessages.push(data);
				}
			})();

			await client.invokePublish('foo', 123);

			assert.strictEqual(client.state, SocketState.OPEN);
			await wait(100);
			assert.strictEqual(receivedMessages.length, 1);
		});
	});
*/
});