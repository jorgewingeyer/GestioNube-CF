"use server";

import { api } from "@/lib/api-client";
import { apiAction } from "../api-action";
import { InferResponseType } from "hono/client";

// Infer the successful response type from the Hono RPC client
type ListUsersResponse = InferResponseType<typeof api.users.list.$get, 200>;
// Extract just the user object type from the data array
export type UserType = NonNullable<ListUsersResponse["data"]>[number];

/**
 * Server Action to fetch all users from the API.
 * Returns an array of users, or an empty array if the request fails.
 */
export async function listUsersAction(): Promise<UserType[]> {
  const result = await apiAction({
    actionName: "listUsers",
    apiCall: () => api.users.list.$get(),
  });

  return result.success && Array.isArray(result.data) ? result.data : [];
}
