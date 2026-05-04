const KEY = "recipe_app_user";

export function getSessionUser(): string | null {
  return localStorage.getItem(KEY);
}

export function setSessionUser(username: string) {
  localStorage.setItem(KEY, username);
}

export function clearSessionUser() {
  localStorage.removeItem(KEY);
}
