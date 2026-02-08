import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Bell, CheckCircle } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  bodyRichtext: string;
  createdAt: string;
  isRead: boolean;
}

export default function TenantAnnouncements() {
  const queryClient = useQueryClient();

  const { data: announcements, isLoading, error } = useQuery({
    queryKey: ["tenant-announcements"],
    queryFn: () => api.get<Announcement[]>("/api/tenant/announcements"),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/tenant/announcements/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-dashboard"] });
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <p className="text-muted-foreground">Failed to load announcements</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium">Announcements</h1>
        <p className="text-muted-foreground">
          Important updates from property management
        </p>
      </div>

      {!announcements || announcements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No announcements</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <Card
              key={announcement.id}
              className={`transition-colors ${
                !announcement.isRead ? "border-accent/50 bg-accent/5" : ""
              }`}
              onClick={() => {
                if (!announcement.isRead) {
                  markReadMutation.mutate(announcement.id);
                }
              }}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`p-2 rounded-full ${
                      announcement.isRead ? "bg-secondary" : "bg-accent/20"
                    }`}
                  >
                    {announcement.isRead ? (
                      <CheckCircle className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Bell className="h-5 w-5 text-accent" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{announcement.title}</h3>
                      {!announcement.isRead && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent text-white">
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      {formatDate(announcement.createdAt)}
                    </p>
                    <div
                      className="text-sm text-muted-foreground prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: announcement.bodyRichtext,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
