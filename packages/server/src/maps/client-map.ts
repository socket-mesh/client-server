import { PublicMethodMap } from "@socket-mesh/client";
import { ServerMap } from "./server-map.js";

export interface ClientMapFromServer<T extends ServerMap> {
	Channel: T['Channel'],
	Incoming: T['Outgoing'] & T['PrivateOutgoing'],
	Service: T['Service'],
	Outgoing: PublicMethodMap,
	PrivateOutgoing: T['PrivateIncoming'],
	State: object
}