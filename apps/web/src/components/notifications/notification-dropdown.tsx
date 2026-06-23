"use client";
import { Button } from "@repo/ui/components/button";
import { Bell, MessageSquare, Info } from "lucide-react";
import { useNotifications } from "./useNotifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export interface AppNotification {
  id: string;
  type: string;
  notifiable_type: string;
  notifiable_id: number;
  data: {
    message: string;
    url?: string;
    subject?: string;
  };
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export function NotificationDropdown() {
  // const { props } = usePage<any>();
  // const notifications = props.auth_notifications?.latest as
  //   | AppNotification[]
  //   | undefined;
  // const unreadCount = props.auth_notifications?.unreadCount as number | undefined;
  const unreadCount = 0;
  const notifications = [
    {
      id: "1",
      type: "Feedback",
      notifiable_type: "User",
      notifiable_id: 1,
      data: {
        message: "Feedback 1",
        url: "/feedback/1",
        subject: "Feedback 1",
      },
      read_at: null,
      created_at: "2023-01-01T00:00:00.000Z",
      updated_at: "2023-01-01T00:00:00.000Z",
    },
  ];
  const { markAsRead } = useNotifications();

  const handleOpenChange = (open: boolean) => {
    // if (open && notifications) {
    //   const unreadIds = notifications
    //     .filter((n) => !n.read_at)
    //     .map((n) => n.id);
    //   if (unreadIds.length > 0) {
    //     markAsRead(unreadIds);
    //   }
    // }
  };

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {!!unreadCount && unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <DropdownMenuLabel className="font-normal px-4 py-3">
          <div className="flex flex-col space-y-0.5">
            <p className="text-sm font-medium leading-none">Notificaciones</p>
            <p className="text-xs leading-none text-muted-foreground">
              Tienes {unreadCount || 0} notificaciones sin leer
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="max-h-[350px] overflow-y-auto">
          {notifications && notifications.length > 0 ? (
            notifications.map((notification) => {
              const isFeedback = notification.type.includes("Feedback");
              const Icon = isFeedback ? MessageSquare : Info;

              return (
                <DropdownMenuItem
                  key={notification.id}
                  asChild
                  className={`cursor-pointer p-3 rounded-none focus:bg-muted/50 ${!notification.read_at ? "bg-primary/5 hover:bg-primary/10" : ""}`}
                >
                  <Link
                    href={notification.data.url || "#"}
                    className="flex items-start gap-3 relative"
                  >
                    {!notification.read_at && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                    )}

                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${!notification.read_at ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </div>

                    <div className="flex flex-col gap-0 flex-1 min-w-0">
                      <span
                        className={`text-[13px] ${!notification.read_at ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}
                      >
                        {notification.data.subject || "Notificación"}
                      </span>
                      <span
                        className={`text-[11px] line-clamp-1 leading-snug ${!notification.read_at ? "text-foreground/80" : "text-muted-foreground/70"}`}
                      >
                        {notification.data.message}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground/60 mt-0.5">
                        {formatDistanceToNow(
                          new Date(notification.created_at),
                          { addSuffix: true, locale: es },
                        )}
                      </span>
                    </div>
                  </Link>
                </DropdownMenuItem>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-20" strokeWidth={1.5} />
              <span className="text-sm">No tienes notificaciones</span>
            </div>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          asChild
          className="w-full text-center cursor-pointer justify-center font-medium text-primary hover:text-primary/90 p-3"
        >
          <Link href="/dashboard/notifications">
            Leer todas las notificaciones
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
