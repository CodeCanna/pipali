// Auth-related types

export interface PlatformUser {
    id: string;
    email: string;
    name?: string;
    isServerOwner?: boolean;
}

export interface AuthStatus {
    anonMode: boolean;
    authenticated: boolean;
    user: PlatformUser | null;
}
