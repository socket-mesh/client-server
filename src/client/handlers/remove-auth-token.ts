import { RequestHandlerArgs } from "../../request-handler.js";
import { EmptySocketMapClient } from "../maps/socket-map.js";

export async function removeAuthTokenHandler(
	{ transport }: RequestHandlerArgs<void, EmptySocketMapClient>
): Promise<void> {
	await transport.deauthenticate();
}