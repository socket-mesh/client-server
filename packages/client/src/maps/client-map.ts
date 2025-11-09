import { SignedAuthToken } from '@socket-mesh/auth';
import { PublishOptions } from '@socket-mesh/channels';

// Typescript automatically adds an index signature to type definitions (vs interfaces).
// If you add an index signature to an interface it has effects on IntelliSense.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ClientPrivateMap = {
	'#kickOut': (options: KickOutOptions) => void,
	'#publish': (options: PublishOptions) => void,
	'#removeAuthToken': () => void,
	'#setAuthToken': (token: SignedAuthToken) => void
};

export interface KickOutOptions {
	channel: string,
	message: string
}
