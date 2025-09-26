import { api } from "./api";

export type CloseAccountBody = {
  password: string;
  confirmName: string;
};

export async function closeAccount(accountId: string, body: CloseAccountBody) {
  // Backend zwraca 204 (No Content) przy sukcesie
  await api.post(`/v1/accounts/${accountId}/close`, body);
}
