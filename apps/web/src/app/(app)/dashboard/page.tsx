import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@repo/ui/components/card";
import { toArgTime } from "@/lib/timezone";
import { listUsersAction, UserType } from "@/actions/users/list-users-action";

export default async function DashboardPage() {
  const users: UserType[] = await listUsersAction();

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardHeader>
              <CardTitle>{user.name}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">ID: {user.id}</p>
              <p className="text-sm text-muted-foreground">
                Joined: {toArgTime(user.created_at!, "Y-m-d")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
