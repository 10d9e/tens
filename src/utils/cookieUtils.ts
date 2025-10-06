/**
 * Utility functions for managing browser cookies
 */

const USERNAME_COOKIE_KEY = 'tens_username';

/**
 * Set a cookie with the given name, value, and expiration days
 */
export function setCookie(name: string, value: string, days: number = 365): void {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

/**
 * Delete a cookie by name
 */
export function deleteCookie(name: string): void {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

/**
 * Get the stored username from cookies
 */
export function getStoredUsername(): string | null {
    return getCookie(USERNAME_COOKIE_KEY);
}

/**
 * Store the username in cookies
 */
export function storeUsername(username: string): void {
    setCookie(USERNAME_COOKIE_KEY, username, 365); // Store for 1 year
}

/**
 * Clear the stored username from cookies
 */
export function clearStoredUsername(): void {
    deleteCookie(USERNAME_COOKIE_KEY);
}
