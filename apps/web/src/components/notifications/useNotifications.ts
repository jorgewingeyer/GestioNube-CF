// import { router } from "@inertiajs/react";
// import NotificationController from "@/actions/App/Http/Controllers/NotificationController";

export function useNotifications() {
  const markAsRead = (ids: string[]) => {
    if (ids.length === 0) return;
    console.log("Marking as read:", ids);
    // TODO: Implement with tRPC
  };

  const destroy = (id: string) => {
    console.log("Destroying notification:", id);
    // TODO: Implement with tRPC
  };

  const destroyAll = (callbacks?: { onSuccess?: () => void }) => {
    console.log("Destroying all notifications");
    // TODO: Implement with tRPC
    callbacks?.onSuccess?.();
  };

  return { markAsRead, destroy, destroyAll };
}
