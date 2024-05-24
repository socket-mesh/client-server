import { Middleware } from "../../middleware/middleware.js";
import { AuthInfo } from "../handlers/authenticate.js";

export interface HandshakeMiddleware extends Middleware {
	type: 'handshake',

	onHandshake(authInfo: AuthInfo): void
}