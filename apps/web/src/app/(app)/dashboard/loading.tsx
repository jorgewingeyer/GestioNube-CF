import { Skeleton } from "@repo/ui/components/skeleton";
import { Card, CardHeader, CardContent } from "@repo/ui/components/card";

export default function DashboardLoading() {
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <Skeleton className="h-10 w-48" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-1/2 mb-2" />
              <Skeleton className="h-4 w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
