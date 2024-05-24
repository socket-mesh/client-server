import { Middleware } from "../../middleware/middleware.js";
import { AuthInfo } from "../handlers/authenticate.js";

export interface AuthenticateMiddleware extends Middleware {
	type: 'authenticate',

	authenticate(authInfo: AuthInfo): void
}