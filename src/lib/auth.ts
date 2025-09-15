export type User = { id: string; email: string; fullName: string };

export type LoginResponse = {
  user: User;
  accessToken: string;
  refreshToken?: string;
};

const ACCESS_KEY = "mb_access";
const USER_KEY = "mb_user";

export const authStore = {
  get token(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  set token(v: string | null) {
    if (v) localStorage.setItem(ACCESS_KEY, v);
    else localStorage.removeItem(ACCESS_KEY);
  },

  get user(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  },
  set user(u: User | null) {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  },

  saveSession(resp: LoginResponse) {
    this.token = resp.accessToken;
    this.user = resp.user;
  },

  logout() {
    this.token = null;
    this.user = null;
  },
};
