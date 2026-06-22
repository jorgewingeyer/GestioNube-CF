import { api } from "@/lib/api-client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@repo/ui/components/card";
import { toArgTime } from "@/lib/timezone";

export default async function DashboardPage() {
  const res = await api.users.list.$get();
  const response = await res.json();

  const users = response.success && "data" in response ? response.data : [];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardHeader>
              <CardTitle>{user.email}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">ID: {user.id}</p>
              <p className="text-sm text-muted-foreground">
                Joined: {toArgTime(user.createdAt!, "Y-m-d")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
