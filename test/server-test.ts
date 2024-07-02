import { afterEach, beforeEach, describe, it } from "node:test";
import { ClientSocketOptions } from "../src/client/client-socket-options";
import { ClientSocket } from "../src/client/client-socket";
import { Server, ServerSocket, listen } from "../src";
import { BasicServerMap, ServerPrivateMap } from "../src/client/maps/server-map";
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
import { AuthStateChangeEvent, AuthenticatedChangeEvent, CloseEvent, ConnectEvent, DisconnectEvent } from "../src/socket-event";
import { ConnectionEvent, SocketAuthStateChangeEvent } from "../src/server/server-event";
import { MiddlewareBlockedError } from "@socket-mesh/errors";
import { AuthOptions } from "../src/server/auth-engine";
import { InOrderMiddleware, MiddlewareArgs, OfflineMiddleware, RequestBatchingMiddleware, ResponseBatchingMiddleware, SendRequestMiddlewareArgs } from "../src/middleware";
import { AnyRequest } from "../src/request";
import { AnyPacket, MethodRequestPacket, isRequestPacket } from "../src/packet";
import { isPublishOptions } from "../src/channels/channels";
import { WritableConsumableStream } from "@socket-mesh/writable-consumable-stream";
import { UnsubscribeEvent } from "../src/channels/channel-events";
import { SimpleBroker } from "../src/server/broker/simple-broker";
import { ExchangeClient } from "../src/server/broker/exchange-client";
import { ChannelOptions } from "../src/channels/channel-options";
import { Channel } from "../src/channels/channel";

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
	{ socket, options: secret }: RequestHandlerArgs<jwt.Secret, BasicSocketMapServer, ServerSocket<BasicServerMap>>
): Promise<void> {
	socket.server!.auth.authKey = secret;
}

async function procHandler(
	{ options: data }: RequestHandlerArgs<number, BasicSocketMapServer>
): Promise<string> {
	return `success ${data}`;
}

const clientOptions: ClientSocketOptions<MyClientMap> = {
	authEngine: { authTokenName },
	address: `ws://127.0.0.1:${PORT_NUMBER}`
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

	describe('Socket pub/sub', function () {
		it('Should maintain order of publish and subscribe', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			const receivedMessages: string[] = [];

			(async () => {
				for await (let data of client.channels.subscribe('foo')) {
					receivedMessages.push(data);
				}
			})();

			await client.channels.invokePublish('foo', 123);

			assert.strictEqual(client.status, 'ready');
			await wait(100);
			assert.strictEqual(receivedMessages.length, 1);
		});

		it('Should maintain order of publish and subscribe when client starts out as disconnected', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			await server.listen('ready').once();

			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<MyClientMap>,
					ClientSocketOptions<MyClientMap>
				>(
					{
						autoConnect: false
					},
					clientOptions
				)
			);

			assert.strictEqual(client.status, 'closed');

			let receivedMessages: number[] = [];

			(async () => {
				for await (let data of client.channels.subscribe<number>('foo')) {
					receivedMessages.push(data);
				}
			})();

			client.channels.invokePublish('foo', 123);

			await wait(100);
			assert.strictEqual(client.status, 'ready');
			assert.strictEqual(receivedMessages.length, 1);
		});

		it('Client should not be able to subscribe to a channel before the handshake has completed', async function () {
			let isSubscribed = false;
			let error: Error | null = null;

			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>>(
					{
						authEngine: {
							async verifyToken() {
								await wait(500);
								return {};
							},
							signToken: async function() {
								return '';
							}
						}
					},
					serverOptions
				)
			);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<MyClientMap>,
					ClientSocketOptions<MyClientMap>
				>(
					{
						middleware: [
							{
								type: 'Subscribe handshake test',
								onOpen({ transport }) {
									// Hack to capture the error without relying on the standard client flow.
									(transport as any)._callbackMap[2] = {
										method: '#subscribe',
										callback: (err: Error) => {
											error = err;
										}
									};

									transport.send('{"cid":2,"method":"#subscribe","data":{"channel":"someChannel"}}');
								}
							}
						]
					},
					clientOptions
				)
			);

			(async () => {
				for await (let event of server.exchange.listen('subscription')) {
					isSubscribed = true;
				}
			})();

			await wait(200);
			assert.strictEqual(isSubscribed, false);
			assert.notEqual(error, null);
			assert.strictEqual(error!.name, 'BadConnectionError');
		});

		it('Server should be able to handle invalid #subscribe and #unsubscribe and #publish events without crashing', async function () {
			let nullInChannelArrayError: Error | null = null;
			let objectAsChannelNameError: Error | null = null;
			let nullChannelNameError: Error | null = null;
			let nullUnsubscribeError: Error | null = null;

			let undefinedPublishError: Error | null = null;
			let objectAsChannelNamePublishError: Error | null = null;
			let nullPublishError: Error | null = null;

			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<MyClientMap>,
					ClientSocketOptions<MyClientMap>
				>(
					{
						middleware: [
							{
								type: 'Subscribe handshake test',
								onOpen({ transport }) {
									// Hacks to capture the errors without relying on the standard client flow.
									(transport as any)._callbackMap[2] = {
										method: '#subscribe',
										data: [null],
										callback: function (err: Error) {
											nullInChannelArrayError = err;
										}
									};
									(transport as any)._callbackMap[3] = {
										method: '#subscribe',
										data: {"channel": {"hello": 123}},
										callback: function (err: Error) {
											objectAsChannelNameError = err;
										}
									};
									(transport as any)._callbackMap[4] = {
										method: '#subscribe',
										data: null,
										callback: function (err: Error) {
											nullChannelNameError = err;
										}
									};
									(transport as any)._callbackMap[5] = {
										method: '#unsubscribe',
										data: [null],
										callback: function (err: Error) {
											nullUnsubscribeError = err;
										}
									};
									(transport as any)._callbackMap[6] = {
										method: '#publish',
										data: null,
										callback: function (err: Error) {
											undefinedPublishError = err;
										}
									};
									(transport as any)._callbackMap[7] = {
										method: '#publish',
										data: {"channel": {"hello": 123}},
										callback: function (err: Error) {
											objectAsChannelNamePublishError = err;
										}
									};
									(transport as any)._callbackMap[8] = {
										method: '#publish',
										data: {"channel": null},
										callback: function (err: Error) {
											nullPublishError = err;
										}
									};

									// Trick the server by sending a fake subscribe before the handshake is done.
									transport.send('{"method":"#subscribe","data":[null],"cid":2}');
									transport.send('{"method":"#subscribe","data":{"channel":{"hello":123}},"cid":3}');
									transport.send('{"method":"#subscribe","data":null,"cid":4}');
									transport.send('{"method":"#unsubscribe","data":[null],"cid":5}');
									transport.send('{"method":"#publish","data":null,"cid":6}');
									transport.send('{"method":"#publish","data":{"channel":{"hello":123}},"cid":7}');
									transport.send('{"method":"#publish","data":{"channel":null},"cid":8}');									
								}
							}
						]
					},
					clientOptions
				)
			);

			await wait(300);

			assert.notEqual(nullInChannelArrayError, null);
			assert.notEqual(objectAsChannelNameError, null);
			assert.notEqual(nullChannelNameError, null);
			assert.notEqual(nullUnsubscribeError, null);
			assert.notEqual(undefinedPublishError, null);
			assert.notEqual(objectAsChannelNamePublishError, null);
			assert.notEqual(nullPublishError, null);
		});

		it('When default SimpleBroker broker engine is used, disconnect event should trigger before unsubscribe event', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			const eventList: ((UnsubscribeEvent | DisconnectEvent) & { type: string })[] = [];

			(async () => {
				await server.listen('ready').once(100);

				client = new ClientSocket(clientOptions);

				await client.channels.subscribe('foo').listen('subscribe').once(100);
				await wait(200);
				client.disconnect();
			})();

			const { socket } = await server.listen('connection').once(100);

			(async () => {
				for await (let event of socket.exchange.listen('unsubscribe')) {
					eventList.push({
						type: 'unsubscribe',
						channel: event.channel
					});
				}
			})();

			(async () => {
				for await (let disconnectPacket of socket.listen('disconnect')) {
					eventList.push({
						type: 'disconnect',
						code: disconnectPacket.code,
						reason: disconnectPacket.reason
					});
				}
			})();

			await wait(300);

			assert.strictEqual(eventList[0].type, 'disconnect');
			assert.strictEqual(eventList[1].type, 'unsubscribe');
			assert.strictEqual((eventList[1] as UnsubscribeEvent).channel, 'foo');
		});

		it('When default SimpleBroker broker engine is used, server.exchange should support consuming data from a channel', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			(async () => {
				await client.listen('connect').once(100);

				client.channels.transmitPublish('foo', 'hi1');
				await wait(10);
				client.channels.transmitPublish('foo', 'hi2');
			})();

			const receivedSubscribedData: string[] = [];
			const receivedChannelData: string[] = [];

			(async () => {
				const subscription = server.exchange.subscribe<string>('foo');

				for await (let data of subscription) {
					receivedSubscribedData.push(data);
				}
			})();

			const channel = server.exchange.channel<string>('foo');

			for await (let data of channel) {
				receivedChannelData.push(data);
				if (receivedChannelData.length > 1) {
					break;
				}
			}

			assert.strictEqual(server.exchange.isSubscribed('foo'), true);
			assert.strictEqual(server.exchange.subscriptions().join(','), 'foo');

			assert.strictEqual(receivedSubscribedData[0], 'hi1');
			assert.strictEqual(receivedSubscribedData[1], 'hi2');
			assert.strictEqual(receivedChannelData[0], 'hi1');
			assert.strictEqual(receivedChannelData[1], 'hi2');
		});

		it('When default SimpleBroker broker engine is used, server.exchange should support publishing data to a channel', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			(async () => {
				await client.channels.listen('subscribe').once(100);
				server.exchange.transmitPublish('bar', 'hello1');
				await wait(10);
				server.exchange.transmitPublish('bar', 'hello2');
			})();

			const receivedSubscribedData: string[] = [];
			const receivedChannelData: string[] = [];

			(async () => {
				const subscription = client.channels.subscribe<string>('bar');
				for await (let data of subscription) {
					receivedSubscribedData.push(data);
				}
			})();

			const channel = client.channels.channel<string>('bar');

			for await (let data of channel) {
				receivedChannelData.push(data);
				if (receivedChannelData.length > 1) {
					break;
				}
			}

			assert.strictEqual(receivedSubscribedData[0], 'hello1');
			assert.strictEqual(receivedSubscribedData[1], 'hello2');
			assert.strictEqual(receivedChannelData[0], 'hello1');
			assert.strictEqual(receivedChannelData[1], 'hello2');
		});

		it('When disconnecting a socket, the unsubscribe event should trigger after the disconnect and close events', async function () {
			class CustomBrokerEngine extends SimpleBroker<MyChannels> {
				async unsubscribe(client: ExchangeClient, channel: string): Promise<void> {
					await wait(100);
					return super.unsubscribe(client, channel);
				}
			}

			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>
				>(
					{
						brokerEngine: new CustomBrokerEngine()
					},
					serverOptions
				)
			);

			bindFailureHandlers(server);

			const eventList: ((UnsubscribeEvent | DisconnectEvent | CloseEvent) & { type: string })[] = [];

			(async () => {
				await server.listen('ready').once(100);
				client = new ClientSocket(clientOptions);

				for await (let event of client.channels.subscribe('foo').listen('subscribe')) {
					(async () => {
						await wait(200);
						client.disconnect();
					})();
				}
			})();

			const { socket } = await server.listen('connection').once(100);

			(async () => {
				for await (let event of socket.exchange.listen('unsubscribe')) {
					eventList.push({
						type: 'unsubscribe',
						channel: event.channel
					});
				}
			})();

			(async () => {
				for await (let event of socket.listen('disconnect')) {
					eventList.push({
						type: 'disconnect',
						code: event.code,
						reason: event.reason
					});
				}
			})();

			(async () => {
				for await (let event of socket.listen('close')) {
					eventList.push({
						type: 'close',
						code: event.code,
						reason: event.reason
					});
				}
			})();

			await wait(700);
			assert.strictEqual(eventList[0].type, 'close');
			assert.strictEqual(eventList[1].type, 'disconnect');
			assert.strictEqual(eventList[2].type, 'unsubscribe');
			assert.strictEqual((eventList[2] as UnsubscribeEvent).channel, 'foo');
		});

		it('Socket should emit an error when trying to unsubscribe from a channel which it is not subscribed to', async function () {
			server = listen( PORT_NUMBER, serverOptions);

			bindFailureHandlers(server);

			const errorList: Error [] = [];

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						for await (let { error } of socket.listen('error')) {
							errorList.push(error);
						}
					})();
				}
			})();

			await server.listen('ready').once();

			client = new ClientSocket(clientOptions);

			await client.listen('connect').once(100);

			let error: Error | null = null;

			try {
				await client.invoke('#unsubscribe' as any, 'bar');
			} catch (err) {
				error = err;
			}

			assert.notEqual(error, null);
			assert.strictEqual(error!.name, 'BrokerError');

			await wait(100);
			assert.strictEqual(errorList.length, 1);
			assert.strictEqual(errorList[0].name, 'BrokerError');
		});

		it('Socket should not receive messages from a channel which it has only just unsubscribed from (accounting for delayed unsubscribe by brokerEngine)', async function () {
			class CustomBrokerEngine extends SimpleBroker<MyChannels> {
				async unsubscribe(client: ExchangeClient, channel: string): Promise<void> {
					await wait(100);
					return super.unsubscribe(client, channel);
				}
			}

			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>
				>(
					{
						brokerEngine: new CustomBrokerEngine()
					},
					serverOptions
				)
			);

			bindFailureHandlers(server);

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					(async () => {
						for await (let event of socket.exchange.listen('unsubscribe')) {
							if (event.channel === 'foo') {
								server.exchange.transmitPublish('foo', 'hello');
							}
						}
					})();
				}
			})();

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			// Stub the isSubscribed method so that it always returns true.
			// That way the client will always invoke watchers whenever
			// it receives a #publish event.
			client.channels.isSubscribed = function () { return true; };

			let messageList: string[] = [];

			let fooChannel = client.channels.subscribe<string>('foo');

			(async () => {
				for await (let data of fooChannel) {
					messageList.push(data);
				}
			})();

			(async () => {
				for await (let event of fooChannel.listen('subscribe')) {
					client.invoke('#unsubscribe' as any, 'foo');
				}
			})();

			await wait(400);
			assert.strictEqual(messageList.length, 0);
		});

		it('Socket channelSubscriptions and channelSubscriptionsCount should update when socket.kickOut(channel) is called', async function () {
			server = listen(PORT_NUMBER, serverOptions);
			bindFailureHandlers(server);

			const errorList: Error[] = [];
			let serverSocket: ServerSocket<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>;
			let wasKickOutCalled = false;

			(async () => {
				for await (let {socket} of server.listen('connection')) {
					serverSocket = socket;

					(async () => {
						for await (let {error} of socket.listen('error')) {
							errorList.push(error);
						}
					})();

					(async () => {
						for await (let event of socket.exchange.listen('subscribe')) {
							if (event.channel === 'foo') {
								await wait(50);
								wasKickOutCalled = true;
								socket.kickOut('foo', 'Socket was kicked out of the channel');
							}
						}
					})();
				}
			})();

			await server.listen('ready').once(100);

			client = new ClientSocket(clientOptions);

			client.channels.subscribe('foo');

			await wait(100);
			assert.strictEqual(errorList.length, 0);
			assert.strictEqual(wasKickOutCalled, true);
			assert.strictEqual(serverSocket!.state.channelSubscriptionsCount, 0);
			assert.strictEqual(Object.keys(serverSocket!.state.channelSubscriptions || {}).length, 0);
		});
	});

	describe('Batching', function () {
		it('Should batch messages sent through sockets after the handshake when the batchOnHandshake option is true', async function () {
			const receivedServerMessages: (string | ArrayBuffer | Buffer[])[] = [];
			let subscribeMiddlewareCounter = 0;

			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>
				>(
					{
						middleware: [
							{
								type: 'Received Server Messages',
								async onMessageRaw({ message }) {
									receivedServerMessages.push(message);
									return message;
								}
							},
							{
								type: 'Inbound Packets',
								// Each subscription should pass through the middleware individually, even
								// though they were sent as a batch/array.
								async onMessage({ packet }) {
									if (isRequestPacket(packet) && packet.method === '#subscribe') {
										subscribeMiddlewareCounter++;
										assert.strictEqual(packet.data.channel.indexOf('my-channel-'), 0);
										if (packet.data.channel === 'my-channel-10') {
											assert.strictEqual(JSON.stringify(packet.data.data), JSON.stringify({foo: 123}));
										} else if (packet.data.channel === 'my-channel-12') {

											// Block my-channel-12
											const err = new Error('You cannot subscribe to channel 12');
											err.name = 'UnauthorizedSubscribeError';
											throw err;
										}
									}

									return packet;
								}
							},
							new ResponseBatchingMiddleware({
								batchOnHandshakeDuration: 400,
								batchInterval: 50
							})
						]
					},
					serverOptions
				)
			);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			const receivedClientMessages: (string | ArrayBuffer | Buffer[])[] = [];

			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<MyClientMap>,
					ClientSocketOptions<MyClientMap>
				>(
					{
						middleware: [
							{
								type: 'Received Client Messages',
								async onMessageRaw({ message }) {
									receivedClientMessages.push(message);
									return message;
								}
							},
							new RequestBatchingMiddleware({
								batchOnHandshakeDuration: 100,
								batchInterval: 50
							})
						]
					},
					clientOptions
				)
			);

			const channelList:Channel<MyChannels, unknown>[] = [];

			for (let i = 0; i < 20; i++) {
				const subscriptionOptions: ChannelOptions = {};
				if (i === 10) {
					subscriptionOptions.data = {foo: 123};
				}
				channelList.push(
					client.channels.subscribe('my-channel-' + i, subscriptionOptions)
				);
			}

			(async () => {
				for await (let event of channelList[12].listen('subscribe')) {
					throw new Error('The my-channel-12 channel should have been blocked by MIDDLEWARE_SUBSCRIBE');
				}
			})();
			
			(async () => {
				for await (let event of channelList[12].listen('subscribeFail')) {
					assert.notEqual(event.error, null);
					assert.strictEqual(event.error.name, 'UnauthorizedSubscribeError');
				}
			})();

			(async () => {
				for await (let event of channelList[19].listen('subscribe')) {
					client.channels.transmitPublish('my-channel-19', 'Hello!');
				}
			})();

			for await (let data of channelList[19]) {
				assert.strictEqual(data, 'Hello!');
				assert.strictEqual(subscribeMiddlewareCounter, 20);
				break;
			}

			assert.notEqual(receivedServerMessages[1], null);
			// All 20 subscriptions should arrive as a single message.
			assert.strictEqual(JSON.parse(receivedServerMessages[1].toString()).length, 20);

			assert.strictEqual(Array.isArray(JSON.parse(receivedClientMessages[0].toString())), false);
			assert.strictEqual(JSON.parse(receivedClientMessages[1].toString()).length, 20);
		});

		it('The batchOnHandshake option should not break the order of subscribe and publish', async function () {
			server = listen(
				PORT_NUMBER,
				Object.assign<
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
					ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>
				>(
					{
						middleware: [
							new ResponseBatchingMiddleware({
								batchOnHandshakeDuration: 400,
								batchInterval: 50
							})
						]
					},
					serverOptions
				)
			);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);

			client = new ClientSocket(
				Object.assign<
					ClientSocketOptions<MyClientMap>,
					ClientSocketOptions<MyClientMap>
				>(
					{
						autoConnect: false,
						middleware: [
							new RequestBatchingMiddleware({
								batchOnHandshakeDuration: 100,
								batchInterval: 50
							})
						]
					},
					clientOptions
				)
			);

			let receivedMessage: string;

			let fooChannel = client.channels.subscribe('foo');
			client.channels.transmitPublish('foo', 'bar');

			for await (let data of fooChannel) {
				receivedMessage = data;
				break;
			}
		});
	});

	describe('Socket Ping/pong', function () {
		describe('When pingTimeoutDisabled is not set', function () {
			beforeEach(async function () {
				// Intentionally make pingInterval higher than pingTimeout, that
				// way the client will never receive a ping or send back a pong.
				server = listen(
					PORT_NUMBER,
					Object.assign<
						ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
						ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>
					>(
						{
							pingIntervalMs: 5000,
							pingTimeoutMs: 500
						},
						serverOptions
					)
				);

				bindFailureHandlers(server);

				await server.listen('ready').once(100);
			});

			it('Should disconnect socket if server does not receive a pong from client before timeout', async function () {
				client = new ClientSocket(clientOptions);

				let serverWarning: Error | null = null;
				(async () => {
					for await (let {error} of server.listen('socketError')) {
						serverWarning = error;
					}
				})();

				let serverDisconnectionCode: number | null = null;
				(async () => {
					for await (let event of server.listen('socketDisconnect')) {
						serverDisconnectionCode = event.code;
					}
				})();

				let clientError: Error | null = null;
				(async () => {
					for await (let {error} of client.listen('error')) {
						clientError = error;
					}
				})();

				let clientDisconnectCode = 0;

				(async () => {
					for await (let event of client.listen('disconnect')) {
						clientDisconnectCode = event.code;
					}
				})();

				await wait(1000);

				assert.notEqual(clientError, null);
				assert.strictEqual(clientError!.name, 'SocketProtocolError');
				assert.strictEqual(clientDisconnectCode === 4000 || clientDisconnectCode === 4001, true);

				assert.notEqual(serverWarning, null);
				assert.strictEqual(serverWarning!.name, 'SocketProtocolError');
				assert.strictEqual(clientDisconnectCode === 4000 || clientDisconnectCode === 4001, true);
			});
		});

		describe('When pingTimeoutDisabled is true', function () {
			beforeEach(async function () {
				// Intentionally make pingInterval higher than pingTimeout, that
				// way the client will never receive a ping or send back a pong.
				server = listen(
					PORT_NUMBER,
					Object.assign<
						ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
						ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>
					>(
						{
							isPingTimeoutDisabled: true,
							pingIntervalMs: 1000,
							pingTimeoutMs: 500
						},
						serverOptions
					)
				);
				bindFailureHandlers(server);

				await server.listen('ready').once(100);
			});

			it('Should not disconnect socket if server does not receive a pong from client before timeout', async function () {
				client = new ClientSocket(
					Object.assign<
						ClientSocketOptions<MyClientMap>,
						ClientSocketOptions<MyClientMap>
					>(
						{
							isPingTimeoutDisabled: true
						},
						clientOptions
					)
				);

				let serverWarning: Error | null = null;
				(async () => {
					for await (let {error} of server.listen('socketError')) {
						serverWarning = error;
					}
				})();

				let serverDisconnectionCode: number | null = null;
				(async () => {
					for await (let event of server.listen('socketDisconnect')) {
						serverDisconnectionCode = event.code;
					}
				})();

				let clientError: Error | null = null;
				(async () => {
					for await (let {error} of client.listen('error')) {
						clientError = error;
					}
				})();

				let clientDisconnectCode: number | null = null;

				(async () => {
					for await (let event of client.listen('disconnect')) {
						clientDisconnectCode = event.code;
					}
				})();

				await wait(1000);

				assert.strictEqual(clientError, null);
				assert.strictEqual(clientDisconnectCode, null);

				assert.strictEqual(serverWarning, null);
				assert.strictEqual(serverDisconnectionCode, null);
			});
		});

		describe('When pingTimeout is greater than pingInterval', function () {
			beforeEach(async function () {
				// Intentionally make pingInterval higher than pingTimeout, that
				// way the client will never receive a ping or send back a pong.
				server = listen(
					PORT_NUMBER,
					Object.assign<
						ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>,
						ServerOptions<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>
					>(
						{
							pingIntervalMs: 400,
							pingTimeoutMs: 1000
						},
						serverOptions
					)
				);

				bindFailureHandlers(server);

				await server.listen('ready').once(100);
			});

			it('Should not disconnect socket if server receives a pong from client before timeout', async function () {
				client = new ClientSocket(clientOptions);

				let serverWarning: Error | null = null;
				(async () => {
					for await (let {error} of server.listen('socketError')) {
						serverWarning = error;
					}
				})();

				let serverDisconnectionCode: number | null = null;
				(async () => {
					for await (let event of server.listen('socketDisconnect')) {
						serverDisconnectionCode = event.code;
					}
				})();

				let clientError: Error | null = null;

				(async () => {
					for await (let {error} of client.listen('error')) {
						clientError = error;
					}
				})();

				let clientDisconnectCode: number | null = null;

				(async () => {
					for await (let event of client.listen('disconnect')) {
						clientDisconnectCode = event.code;
					}
				})();

				await wait(2000);
				assert.strictEqual(clientError, null);
				assert.strictEqual(clientDisconnectCode, null);

				assert.strictEqual(serverWarning, null);
				assert.strictEqual(serverDisconnectionCode, null);
			});
		});
	});

	describe('Middleware', function () {
		beforeEach(async function () {
			server = listen(PORT_NUMBER, serverOptions);

			bindFailureHandlers(server);

			await server.listen('ready').once(100);
		});

		describe('onConnection', function () {
			it('Delaying handshake for one client should not affect other clients', async function () {
				server.addMiddleware({
					type: 'onConnection Delay',
					async onConnection(req) {
						if (req.url && req.url.indexOf('?delayMe=true') !== -1) {
							// Long delay.
							await wait(300);
						}
					}
				});

				const clientA = new ClientSocket(clientOptions);
				const clientB = new ClientSocket(
					Object.assign<
						ClientSocketOptions<MyClientMap>,
						ClientSocketOptions<MyClientMap>,
						ClientSocketOptions<MyClientMap>
					>(
						{},
						clientOptions,
						{ address: `ws://127.0.0.1:${PORT_NUMBER}?delayMe=true` }
					)
				);

				let clientAIsConnected = false;
				let clientBIsConnected = false;

				(async () => {
					await clientA.listen('connect').once();
					clientAIsConnected = true;
				})();

				(async () => {
					await clientB.listen('connect').once();
					clientBIsConnected = true;
				})();

				await wait(100);

				assert.strictEqual(clientAIsConnected, true);
				assert.strictEqual(clientBIsConnected, false);

				clientA.disconnect();
				clientB.disconnect();
			});
		});

		describe('onHandshake', function () {
			it('Should trigger correct events if handshake middleware blocks with an error', async function () {
				let middlewareWasExecuted = false;
				const serverWarnings: Error[] = [];
				const clientErrors: Error[] = [];
				let abortStatus: number | null = null;

				server.addMiddleware({
					type: 'Handshake Middleware',
					async onHandshake() {
						await wait(100);
						middlewareWasExecuted = true;
						const err = new Error('Handshake failed because the server was too lazy');
						err.name = 'TooLazyHandshakeError';

						throw err;
					}
				});

				(async () => {
					for await (let { error } of server.listen('socketError')) {
						serverWarnings.push(error);
					}
				})();

				client = new ClientSocket(clientOptions);

				(async () => {
					for await (let {error} of client.listen('error')) {
						clientErrors.push(error);
					}
				})();

				(async () => {
					let event = await client.listen('connectAbort').once();
					abortStatus = event.code;
				})();

				await wait(200);

				assert.strictEqual(middlewareWasExecuted, true);
				assert.notEqual(clientErrors[0], null);
				assert.strictEqual(clientErrors[0].name, 'TooLazyHandshakeError');
				assert.notEqual(clientErrors[1], null);
				assert.strictEqual(clientErrors[1].name, 'SocketProtocolError');
				assert.notEqual(serverWarnings[0], null);
				assert.strictEqual(serverWarnings[0].name, 'TooLazyHandshakeError');
				assert.notEqual(abortStatus, null);
			});

			it('Should send back default 4008 status code if handshake middleware blocks without providing a status code', async function () {
				let middlewareWasExecuted = false;
				let abortStatus = 0;
				let abortReason: string | undefined = '';

				server.addMiddleware({
					type: 'Handshake Middleware',
					async onHandshake() {
						await wait(100);
						middlewareWasExecuted = true;
						const err = new Error('Handshake failed because the server was too lazy');
						err.name = 'TooLazyHandshakeError';

						throw err;
					}
				});

				client = new ClientSocket(clientOptions);

				(async () => {
					const event = await client.listen('connectAbort').once();
					abortStatus = event.code;
					abortReason = event.reason;
				})();

				await wait(200);
				assert.strictEqual(middlewareWasExecuted, true);
				assert.strictEqual(abortStatus, 4008);
				assert.strictEqual(abortReason, 'TooLazyHandshakeError: Handshake failed because the server was too lazy');
			});

			it('Should send back custom status code if handshake middleware blocks by providing a status code', async function () {
				let middlewareWasExecuted = false;
				let abortStatus: number;
				let abortReason: string | undefined;

				server.addMiddleware({
					type: 'Handshake Middleware',
					async onHandshake() {
						await wait(100);
						middlewareWasExecuted = true;
						const err = new Error('Handshake failed because of invalid query auth parameters');
						err.name = 'InvalidAuthQueryHandshakeError';
						// Set custom 4501 status code as a property of the error.
						// We will treat this code as a fatal authentication failure on the front end.
						// A status code of 4500 or higher means that the client shouldn't try to reconnect.
						(err as any).statusCode = 4501;

						throw err;
					}
				});

				client = new ClientSocket(clientOptions);

				(async () => {
					let event = await client.listen('connectAbort').once();
					abortStatus = event.code;
					abortReason = event.reason;
				})();

				await wait(200);
				assert.strictEqual(middlewareWasExecuted, true);
				assert.strictEqual(abortStatus!, 4501);
				assert.strictEqual(abortReason!, 'InvalidAuthQueryHandshakeError: Handshake failed because of invalid query auth parameters');
			});

			it('Should connect with a delay if allow() is called after a timeout inside the middleware function', async function () {
				let createConnectionTime: number | null = null;
				let connectEventTime: number | null = null;
				let abortStatus: number;
				let abortReason: string | undefined;

				server.addMiddleware({
					type: 'Handshake Middleware',
					async onHandshake() {
						await wait(500);
					}
				});

				createConnectionTime = Date.now();
				client = new ClientSocket(clientOptions);

				(async () => {
					const event = await client.listen('connectAbort').once();
					abortStatus = event.code;
					abortReason = event.reason;
				})();

				await client.listen('connect').once(1000);
				connectEventTime = Date.now();
				assert.strictEqual(connectEventTime - createConnectionTime > 400, true);
			});

			it('Should not be allowed to call setAuthorization from inside middleware', async function () {
				let didAuthenticationEventTrigger = false;
				let setAuthTokenError: Error | null = null;

				server.addMiddleware({
					type: 'Handshake Middleware',
					async onHandshake({ transport }) {
						try {
							await transport.setAuthorization({username: 'alice'});
						} catch (error) {
							setAuthTokenError = error;
						}
					}
				});

				(async () => {
					let event = await server.listen('socketAuthenticate').once();

					didAuthenticationEventTrigger = true;
				})();

				client = new ClientSocket(clientOptions);

				const event = await client.listen('connect').once(100);

				assert.strictEqual(event.isAuthenticated, false);
				assert.strictEqual(client.signedAuthToken, undefined);
				assert.strictEqual(client.authToken, undefined);
				assert.strictEqual(didAuthenticationEventTrigger, false);
				assert.notEqual(setAuthTokenError, undefined);
				assert.strictEqual(setAuthTokenError!.name, 'InvalidActionError');
			});

			it('Delaying handshake for one client should not affect other clients', async function () {
				server.addMiddleware({
					type: 'Handshake Middleware',
					async onHandshake({ transport }) {
						if (transport.request.url && transport.request.url.indexOf('?delayMe=true') !== -1) {
							// Long delay.
							await wait(500);
						}
					}
				});

				const clientA = new ClientSocket(clientOptions);
				const clientB = new ClientSocket(
					Object.assign<
						ClientSocketOptions<MyClientMap>,
						ClientSocketOptions<MyClientMap>,
						ClientSocketOptions<MyClientMap>
					>(
						{},
						clientOptions,
						{ address: `ws://127.0.0.1:${PORT_NUMBER}?delayMe=true` }
					)
				);

				let clientAIsConnected = false;
				let clientBIsConnected = false;

				(async () => {
					await clientA.listen('connect').once();
					clientAIsConnected = true;
				})();

				(async () => {
					await clientB.listen('connect').once();
					clientBIsConnected = true;
				})();

				await wait(100);

				assert.strictEqual(clientAIsConnected, true);
				assert.strictEqual(clientBIsConnected, false);

				clientA.disconnect();
				clientB.disconnect();
			});
		});

		describe('Inbound Middleware', function () {
			describe('onMessage', function () {
				it('Should run INVOKE action in middleware if client invokes an RPC', async function () {
					let middlewareWasExecuted = false;
					let middlewarePacket: MethodRequestPacket<ServerIncomingMap & ServerPrivateMap, "proc"> | null = null;

					server.addMiddleware({
						type: 'onMessage',
						async onMessage({ packet }) {
							if (isRequestPacket(packet) && packet.method === 'proc') {
								middlewarePacket = packet;
								middlewareWasExecuted = true;
							}

							return packet;
						}
					});

					client = new ClientSocket(clientOptions);

					await client.listen('connect').once(100);

					const result = await client.invoke('proc', 123);

					assert.strictEqual(middlewareWasExecuted, true);
					assert.notEqual(middlewarePacket, null);
					assert.strictEqual(result, 'success 123');
				});

				it('Should send back custom Error if INVOKE action in middleware blocks the client RPC', async function () {
					let middlewareWasExecuted = false;
					let middlewarePacket: AnyPacket<SocketMapFromServer<BasicServerMap<ServerIncomingMap, MyChannels, {}, ClientIncomingMap>>> | null = null;

					server.addMiddleware({
						type: 'onMessage',
						async onMessage({ packet }) {
							if (isRequestPacket(packet) && packet.method === 'proc') {
								middlewarePacket = packet;
								middlewareWasExecuted = true;

								const customError = new Error('Invoke action was blocked');
								customError.name = 'BlockedInvokeError';
								throw customError;
							}

							return packet;
						}
					});

					client = new ClientSocket(clientOptions);

					await client.listen('connect').once(100);

					let result: string | undefined;
					let error: Error | null = null;

					try {
						result = await client.invoke('proc', 123);
					} catch (err) {
						error = err;
					}

					assert.strictEqual(result, undefined);
					assert.notEqual(error, null);
					assert.strictEqual(error!.name, 'BlockedInvokeError');
				});
			});

			describe('onAuthenticate', function () {
				it('Should not run onAuthenticate in middleware if JWT token does not exist', async function () {
					let middlewareWasExecuted = false;

					server.addMiddleware({
						type: 'onAuthenticate',
						onAuthenticate() {
							middlewareWasExecuted = true;
						},
					});

					client = new ClientSocket(clientOptions);

					await client.listen('connect').once(100);
					assert.notEqual(middlewareWasExecuted, true);
				});

				it('Should run onAuthenticate in middleware if JWT token exists', async function () {
					global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);
					let middlewareWasExecuted = false;

					server.addMiddleware({
						type: 'onAuthenticate',
						onAuthenticate() {
							middlewareWasExecuted = true;
						},
					});

					client = new ClientSocket(clientOptions);

					await client.listen('connect').once(100);

					(async () => {
						try {
							await client.invoke('login', {username: 'bob'});
						} catch (err) {}
					})();

					await client.listen('authenticate').once(100);

					assert.strictEqual(middlewareWasExecuted, true);
				});
			});

			describe('onPublishIn', function () {
				it('Should run onPublishIn in middleware if client publishes to a channel', async function () {
					let middlewareWasExecuted = false;
					let middlewareDetails: { channel: string, data: string } | null = null;

					server.addMiddleware({
						type: 'Publish In',
						async onPublishIn({ socket, transport, ...etc }) {
							middlewareWasExecuted = true;
							middlewareDetails = etc;
							
							return etc.data;
						}
					});

					client = new ClientSocket(clientOptions);

					await client.listen('connect').once(100);

					await client.channels.invokePublish('hello', 'world');

					assert.strictEqual(middlewareWasExecuted, true);
					assert.notEqual(middlewareDetails, null);
					assert.strictEqual(middlewareDetails!.channel, 'hello');
					assert.strictEqual(middlewareDetails!.data, 'world');
				});

				it('Should be able to delay and block publish using onPublishIn middleware', async function () {
					let middlewareWasExecuted = false;

					server.addMiddleware({
						type: 'Publish In',
						async onPublishIn({ socket, transport, ...etc }) {
							middlewareWasExecuted = true;
							await wait(50);
							const error = new Error('Blocked by middleware');
							error.name = 'BlockedError';
							throw error;
						}
					});

					client = new ClientSocket(clientOptions);

					const helloChannel = client.channels.subscribe<string>('hello');
					await helloChannel.listen('subscribe').once(100);

					let receivedMessages: string[] = [];
					(async () => {
						for await (let data of helloChannel) {
							receivedMessages.push(data);
						}
					})();

					let error: Error | null = null;
					try {
						await client.channels.invokePublish('hello', 'world');
					} catch (err) {
						error = err;
					}
					await wait(100);

					assert.strictEqual(middlewareWasExecuted, true);
					assert.notEqual(error, null);
					assert.strictEqual(error!.name, 'BlockedError');
					assert.strictEqual(receivedMessages.length, 0);
				});

				it('Delaying onPublishIn for one client should not affect other clients', async function () {
					let done: () => void;
					const donePromise = new Promise<void>((resolve) => { done = resolve; });

					server.addMiddleware({
						type: 'Publish In',
						async onPublishIn({ data, transport }) {
							if (transport.request.url!.indexOf('?delayMe=true') !== -1) {
								// Long delay.
								await donePromise;
							}

							return data;
						}
					});

					server.addMiddleware(new InOrderMiddleware());

					const clientC = new ClientSocket(clientOptions);
					const receivedMessages: string[] = [];

					(async () => {
						for await (let data of clientC.channels.subscribe('foo')) {
							receivedMessages.push(data);
						}
					})();

					const clientA = new ClientSocket(clientOptions);
					const clientB = new ClientSocket(
						Object.assign<
							ClientSocketOptions<MyClientMap>,
							ClientSocketOptions<MyClientMap>,
							ClientSocketOptions<MyClientMap>
						>(
							{},
							clientOptions,
							{ address: `ws://127.0.0.1:${PORT_NUMBER}?delayMe=true` }
						)
					);

					await Promise.all([
						clientA.listen('connect').once(100),
						clientB.listen('connect').once(100)
					]);

					clientA.channels.transmitPublish('foo', 'a1');
					clientA.channels.transmitPublish('foo', 'a2');
					clientB.channels.transmitPublish('foo', 'b1');
					clientB.channels.transmitPublish('foo', 'b2');

					await wait(100);

					done!();

					assert.strictEqual(receivedMessages.length, 2);
					assert.strictEqual(receivedMessages[0], 'a1');
					assert.strictEqual(receivedMessages[1], 'a2');

					clientA.disconnect();
					clientB.disconnect();
					clientC.disconnect();
				});

				it('Should allow to change message in middleware when client invokePublish', async function() {
					const clientMessage = 'world';
					const middlewareMessage = 'intercepted';

					server.addMiddleware({
						type: 'Publish In',
						async onPublishIn() {
							return middlewareMessage;
						}
					});

					const client = new ClientSocket(clientOptions);
					const helloChannel = client.channels.subscribe<string>('hello');
					const receivedMessages: string[] = [];

					await helloChannel.listen('subscribe').once(100);

					(async () => {
						for await (let data of helloChannel) {
							receivedMessages.push(data);
						}
					})();

					let error: Error | null = null;
					try {
						await client.channels.invokePublish('hello', clientMessage);
					} catch (err) {
						error = err;
					}

					await wait(100);

					assert.notEqual(clientMessage, middlewareMessage);
					assert.strictEqual(receivedMessages[0], middlewareMessage);
				});

				it('Should allow to change message in middleware when client transmitPublish', async function() {
					const clientMessage = 'world';
					const middlewareMessage = 'intercepted';

					server.addMiddleware({
						type: 'Publish In',
						async onPublishIn() {
							return middlewareMessage;
						}
					});

					const client = new ClientSocket(clientOptions);
					const helloChannel = client.channels.subscribe<string>('hello');
					const receivedMessages: string[] = [];

					await helloChannel.listen('subscribe').once();

					(async () => {
						for await (let data of helloChannel) {
							receivedMessages.push(data);
						}
					})();

					let error: Error | null = null;

					try {
						await client.channels.transmitPublish('hello', clientMessage);
					} catch (err) {
						error = err;
					}

					await wait(100);

					assert.notEqual(clientMessage, middlewareMessage);
					assert.strictEqual(receivedMessages[0], middlewareMessage);
				})
			});

			describe('onSubscribe', function () {
				it('Should run onSubscribe in middleware if client subscribes to a channel', async function () {
					let middlewareWasExecuted = false;
					let middlewareChannel: string | null = null;

					server.addMiddleware({
						type: 'Subscribe',
						async onSubscribe({ channel }) {
							middlewareWasExecuted = true;
							middlewareChannel = channel;
						}
					});

					const client = new ClientSocket(clientOptions);

					await client.channels.subscribe('hello').listen('subscribe').once();

					assert.strictEqual(middlewareWasExecuted, true);
					assert.strictEqual(middlewareChannel, 'hello');
				});

				it('Should maintain pub/sub order if onSubscribe is delayed in middleware even if client starts out in disconnected state', async function () {
					let middlewareActions: { type: string, channel: string }[] = [];

					server.addMiddleware(
						new InOrderMiddleware(),
						{
							type: 'Subscribe',
							async onSubscribe({ channel }) {
								middlewareActions.push({ type: 'subscribe', channel });
								await wait(100);
							},
							async onPublishIn({ channel, data }) {
								middlewareActions.push({ type: 'publishIn', channel });
								return data;
							},
						}
					);

					const client = new ClientSocket(
						Object.assign<
							ClientSocketOptions<MyClientMap>,
							ClientSocketOptions<MyClientMap>>(
								{ autoConnect: false },
								clientOptions
							)
					);

					let receivedMessage: string;

					const fooChannel = client.channels.subscribe<string>('foo');
					client.channels.transmitPublish('foo', 'bar');

					for await (let data of fooChannel) {
						receivedMessage = data;
						break;
					}

					assert.strictEqual(receivedMessage!, 'bar');
					assert.strictEqual(middlewareActions.length, 2);
					assert.strictEqual(middlewareActions[0].type, 'subscribe');
					assert.strictEqual(middlewareActions[0].channel, 'foo');
					assert.strictEqual(middlewareActions[1].type, 'publishIn');
					assert.strictEqual(middlewareActions[1].channel, 'foo');
				});
			});
		});		
	});
});