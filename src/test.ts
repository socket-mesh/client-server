//import { MethodMap, ServiceMap } from "./method-map";
import { listen } from "./index.js";
import { ClientSocket } from "./client/client-socket";
import { ServerPrivateMap } from "./client/maps/server-private-map.js";
import { Socket } from "./socket.js";
import { ClientPrivateMap } from "./client/maps/client-private-map.js";
import { MethodMap, ServiceMap } from "./client/maps/method-map.js";
import { RequestPacket } from "./request.js";

export type RemoveIndexSignature<T> = {  
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K
  ]: T[K];
}

function wait(duration: number): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(() => {
			resolve();
		}, duration);
	});
}

//let a: { [key: string]: MethodMap<UserService> } = fn;

type IncludeMatchingProperties<T, V> = Pick<
  T,
  { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T]
>


type KeysMatching<T extends object, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never
}[keyof T];

interface Result<Map extends { [K in keyof Map]: (...args: any) => any }, TMethod extends keyof Map> {
	result: ReturnType<Map[TMethod]>
}

interface UserService {
	login(username: string): boolean,
	logout(i: number): void
}

interface TicketService {
	create(): void
}

interface MyServices {
	users: UserService,
	tickets: TicketService
}

let mySocket: ClientSocket<{}, {}, MyServices, {}, {}, ServerPrivateMap>;

mySocket.invoke(['users', 'login'], '');



type Handler<T> = (t: T) => void;

class Server<T> {
	addHandler(handler: Handler<T>): void {
	}
}

interface User {
	firstName: string,
	lastName: string
}

const server = new Server<User>;

function test(user: { firstName: string }) {}

server.addHandler(test)

export interface MethodRequestPacket<TMethodMap extends MethodMap<TMethodMap>, TMethod extends keyof TMethodMap> extends RequestPacket {
	method: TMethod,
	data?: Parameters<TMethodMap[TMethod]>[0],
	ackTimeoutMs: number | boolean
}

export type MethodPacket<TMethodMap extends MethodMap<TMethodMap>> =
	{ [TMethod in keyof TMethodMap]: 
		MethodRequestPacket<TMethodMap, TMethod>
	}[keyof TMethodMap];


interface Client<TIncoming = any> {
	incoming: TIncoming
}

interface MyClient {
	incoming: number
}

class Test<T extends Client> {
	fn(): T['incoming'] {
		return;
	}
}

let t: Test<MyClient>;

t.fn