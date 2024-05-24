import { SignedAuthToken } from "@socket-mesh/auth";
import { RequestHandlerArgs } from "../../request-handler.js";
import { EmptySocketMapClient } from "../maps/socket-map.js";

export async function setAuthTokenHandler(
	{ transport, options }: RequestHandlerArgs<SignedAuthToken, EmptySocketMapClient>
): Promise<void> {
	await transport.setAuthorization(options);
}