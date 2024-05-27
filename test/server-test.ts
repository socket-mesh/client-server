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
import { AuthStateChangeEvent } from "../src/socket-event";
import { SocketAuthenticatedChangeEvent } from "../src/server/server-event";

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

	transport.setAuthorization(authToken);
}

async function loginWithTenDayExpiryHandler(
	{ transport, options: authToken }: RequestHandlerArgs<AuthToken, BasicSocketMapServer, ServerSocket<BasicServerMap>, ServerTransport<BasicServerMap>>
): Promise<void> {
	if (!allowedUsers[authToken.username]) {
		const err = new Error('Failed to login');
		err.name = 'FailedLoginError';
		throw err;
	}

	transport.setAuthorization(authToken, { expiresIn: TEN_DAYS_IN_SECONDS });
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

	transport.setAuthorization(authToken);
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

	transport.setAuthorization(authToken, { expiresIn: TEN_DAYS_IN_SECONDS * 100 });
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

	transport.setAuthorization(authToken, { issuer: 'bar' });
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
									const err = new Error('Blocked by MIDDLEWARE_INBOUND');
									err.name = 'AuthenticateMiddlewareError';
									throw err;
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
			const authenticationStateChangeEvents: SocketAuthenticatedChangeEvent<BasicServerMap<ServerIncomingMap, MyChannels>>[] = [];
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

			const authenticationStateChangeEvents: SocketAuthenticatedChangeEvent<BasicServerMap<ServerIncomingMap, MyChannels>>[] = [];
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
			assert.strictEqual(authenticationStateChangeEvents[1].wasAuthenticated, true);
			assert.strictEqual(authenticationStateChangeEvents[1].isAuthenticated, false);
			assert.strictEqual(authenticationStateChangeEvents[1].authToken, undefined);
		});

/*
		it('Should throw error if server socket deauthenticate is called after client disconnected and rejectOnFailedDelivery is true', async function () {
			global.localStorage.setItem(authTokenName, validSignedAuthTokenBob);

			client = new ClientSocket(clientOptions);

			const { socket } = await server.listen('connection').once(100);

			client.disconnect();
			let error: Error | null = null;
			try {
				await socket.deauthenticate({rejectOnFailedDelivery: true});
			} catch (err) {
				error = err;
			}
			assert.notEqual(error, null);
			assert.strictEqual(error!.name, 'BadConnectionError');
		});
*/
	});
});