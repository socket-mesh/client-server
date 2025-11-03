export enum AuthState {
	AUTHENTICATED = 'authenticated',
	UNAUTHENTICATED = 'unauthenticated'
}

export interface AuthStateChange {
	newAuthState: AuthState,
	oldAuthState: AuthState
}
