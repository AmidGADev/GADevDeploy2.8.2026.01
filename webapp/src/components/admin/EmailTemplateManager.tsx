import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  Send,
  RotateCcw,
  Pencil,
  AlertCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Wrench,
  FileText,
  PartyPopper,
  Eye,
  Settings2,
  FileEdit,
} from "lucide-react";
import {
  RichTextEditor,
  PlaceholderTray,
  EmailPreview,
  AutomationSettings,
  getScheduleDescription,
  type PlaceholderItem,
  type AutomationSettingsData,
} from "./email-template-editor";

interface EmailTemplatePlaceholder {
  key: string;
  description: string;
  example: string;
}

interface EmailTemplate {
  id: string;
  templateKey: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  isActive: boolean;
  placeholders: EmailTemplatePlaceholder[];
  // Automation settings
  timingOffset: number;
  timingUnit: string;
  timingDirection: string;
  frequency: string;
  frequencyInterval: number | null;
  maxSendCount: number | null;
  triggerCondition: string | null;
  sendWindowStart: string;
  sendWindowEnd: string;
  sendWindowTimezone: string;
  createdAt: string;
  updatedAt: string;
  updatedById: string | null;
}

const TEMPLATE_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; bgColor: string; priority: number }
> = {
  WELCOME_EMAIL: {
    icon: <PartyPopper className="h-4 w-4 text-violet-600" />,
    color: "border-violet-300",
    bgColor: "bg-gradient-to-br from-violet-50 to-purple-50",
    priority: 0,
  },
  RENT_REMINDER: {
    icon: <Clock className="h-4 w-4 text-blue-600" />,
    color: "border-blue-200",
    bgColor: "bg-blue-50",
    priority: 1,
  },
  OVERDUE_ALERT: {
    icon: <AlertTriangle className="h-4 w-4 text-red-600" />,
    color: "border-red-200",
    bgColor: "bg-red-50",
    priority: 2,
  },
  MAINTENANCE_UPDATE: {
    icon: <Wrench className="h-4 w-4 text-amber-600" />,
    color: "border-amber-200",
    bgColor: "bg-amber-50",
    priority: 3,
  },
  NEW_INVOICE: {
    icon: <FileText className="h-4 w-4 text-green-600" />,
    color: "border-green-200",
    bgColor: "bg-green-50",
    priority: 4,
  },
};

export function EmailTemplateManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editForm, setEditForm] = useState({ subject: "", body: "" });
  const [automationSettings, setAutomationSettings] = useState<AutomationSettingsData | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "automation">("content");
  const [testEmailDialog, setTestEmailDialog] = useState<{
    open: boolean;
    templateKey: string;
    templateName: string;
  }>({ open: false, templateKey: "", templateName: "" });
  const [testEmail, setTestEmail] = useState("amid.elsabbagh@gmail.com");
  const [resetConfirmDialog, setResetConfirmDialog] = useState<{
    open: boolean;
    templateKey: string;
    templateName: string;
  }>({ open: false, templateKey: "", templateName: "" });

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin", "email-templates"],
    queryFn: () => api.get<EmailTemplate[]>("/api/admin/email-templates"),
  });

  // Sort templates by priority
  const sortedTemplates = templates?.sort(
    (a, b) =>
      (TEMPLATE_CONFIG[a.templateKey]?.priority ?? 99) -
      (TEMPLATE_CONFIG[b.templateKey]?.priority ?? 99)
  );

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: ({
      key,
      data,
    }: {
      key: string;
      data: {
        subject: string;
        body: string;
        isActive?: boolean;
        timingOffset?: number;
        timingUnit?: "days" | "hours";
        timingDirection?: "before" | "after";
        frequency?: "once" | "daily" | "weekly" | "custom";
        frequencyInterval?: number | null;
        maxSendCount?: number | null;
        triggerCondition?: string | null;
        sendWindowStart?: string;
        sendWindowEnd?: string;
        sendWindowTimezone?: string;
      };
    }) => api.put<EmailTemplate>(`/api/admin/email-templates/${key}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "email-templates"] });
      setEditingTemplate(null);
      setAutomationSettings(null);
      toast({
        title: "Template Saved",
        description: "Your changes have been saved successfully.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save template.",
        variant: "destructive",
      });
    },
  });

  // Reset template mutation
  const resetMutation = useMutation({
    mutationFn: (key: string) =>
      api.post<EmailTemplate>(`/api/admin/email-templates/${key}/reset`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "email-templates"] });
      setResetConfirmDialog({ open: false, templateKey: "", templateName: "" });
      toast({
        title: "Template Reset",
        description: "Email template has been reset to default.",
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset template.",
        variant: "destructive",
      });
    },
  });

  // Test email mutation
  const testMutation = useMutation({
    mutationFn: (data: { templateKey: string; recipientEmail: string }) =>
      api.post("/api/admin/email-templates/test", data),
    onSuccess: () => {
      setTestEmailDialog({ open: false, templateKey: "", templateName: "" });
      toast({
        title: "Test Email Sent",
        description: `Test email sent to ${testEmail}`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Send Failed",
        description: error.message || "Failed to send test email.",
        variant: "destructive",
      });
    },
  });

  // Toggle active status
  const toggleActiveMutation = useMutation({
    mutationFn: ({ key, isActive }: { key: string; isActive: boolean }) =>
      api.put<EmailTemplate>(`/api/admin/email-templates/${key}`, {
        subject: templates?.find((t) => t.templateKey === key)?.subject || "",
        body: templates?.find((t) => t.templateKey === key)?.body || "",
        isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "email-templates"] });
    },
    onError: (error: ApiError) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update template status.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditForm({ subject: template.subject, body: template.body });
    setAutomationSettings({
      timingOffset: template.timingOffset,
      timingUnit: template.timingUnit as "days" | "hours",
      timingDirection: template.timingDirection as "before" | "after",
      frequency: template.frequency as "once" | "daily" | "weekly" | "custom",
      frequencyInterval: template.frequencyInterval,
      maxSendCount: template.maxSendCount,
      triggerCondition: template.triggerCondition,
      sendWindowStart: template.sendWindowStart,
      sendWindowEnd: template.sendWindowEnd,
      sendWindowTimezone: template.sendWindowTimezone,
    });
    setShowPreview(false);
    setActiveTab("content");
  };

  const handleSave = () => {
    if (!editingTemplate || !automationSettings) return;
    updateMutation.mutate({
      key: editingTemplate.templateKey,
      data: {
        ...editForm,
        ...automationSettings,
      },
    });
  };

  const handleSendTest = () => {
    testMutation.mutate({
      templateKey: testEmailDialog.templateKey,
      recipientEmail: testEmail,
    });
  };

  if (isLoading) {
    return (
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Email Template Manager</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Customize your automated tenant communications with our visual editor.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {sortedTemplates?.map((template) => {
              const config = TEMPLATE_CONFIG[template.templateKey] || {
                icon: <Mail className="h-4 w-4" />,
                color: "border-gray-200",
                bgColor: "bg-gray-50",
              };
              const isWelcome = template.templateKey === "WELCOME_EMAIL";

              return (
                <div
                  key={template.id}
                  className={cn(
                    "border rounded-lg p-4 transition-all hover:shadow-sm",
                    config.color,
                    config.bgColor,
                    isWelcome && "ring-2 ring-violet-200 ring-offset-1"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="p-2 rounded-lg bg-white shadow-sm shrink-0">
                        {config.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{template.name}</span>
                          {isWelcome && (
                            <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-[10px] px-1.5">
                              Primary
                            </Badge>
                          )}
                          {!template.isActive && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Disabled
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {template.description}
                        </p>
                        {/* Schedule Badge */}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-white/80">
                            <Clock className="h-2.5 w-2.5 mr-1" />
                            {getScheduleDescription(template.templateKey, {
                              timingOffset: template.timingOffset,
                              timingUnit: template.timingUnit as "days" | "hours",
                              timingDirection: template.timingDirection as "before" | "after",
                              frequency: template.frequency as "once" | "daily" | "weekly" | "custom",
                              frequencyInterval: template.frequencyInterval,
                              maxSendCount: template.maxSendCount,
                              triggerCondition: template.triggerCondition,
                              sendWindowStart: template.sendWindowStart,
                              sendWindowEnd: template.sendWindowEnd,
                              sendWindowTimezone: template.sendWindowTimezone,
                            })}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {template.sendWindowStart}–{template.sendWindowEnd}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch
                                checked={template.isActive}
                                onCheckedChange={(checked) =>
                                  toggleActiveMutation.mutate({
                                    key: template.templateKey,
                                    isActive: checked,
                                  })
                                }
                                className="scale-90"
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              {template.isActive ? "Disable" : "Enable"} this template
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-white"
                        onClick={() => handleEdit(template)}
                      >
                        <Pencil className="h-3 w-3 mr-1.5" />
                        Edit
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-white"
                        onClick={() =>
                          setTestEmailDialog({
                            open: true,
                            templateKey: template.templateKey,
                            templateName: template.name,
                          })
                        }
                      >
                        <Send className="h-3 w-3 mr-1.5" />
                        Test
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* WYSIWYG Edit Template Dialog */}
      <Dialog
        open={!!editingTemplate}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
      >
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {editingTemplate && (
                  <div className="p-2 rounded-lg bg-muted">
                    {TEMPLATE_CONFIG[editingTemplate.templateKey]?.icon || (
                      <Mail className="h-4 w-4" />
                    )}
                  </div>
                )}
                <div>
                  <DialogTitle>Edit {editingTemplate?.name}</DialogTitle>
                  <DialogDescription className="mt-0.5">
                    Use the visual editor to customize your email content.
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={showPreview ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  {showPreview ? "Hide Preview" : "Preview"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() =>
                    editingTemplate &&
                    setResetConfirmDialog({
                      open: true,
                      templateKey: editingTemplate.templateKey,
                      templateName: editingTemplate.name,
                    })
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Reset
                </Button>
              </div>
            </div>
          </DialogHeader>

          {editingTemplate && automationSettings && (
            <div className="flex-1 overflow-hidden flex">
              {/* Editor Panel with Tabs */}
              <div
                className={cn(
                  "flex-1 flex flex-col overflow-hidden border-r",
                  showPreview ? "w-1/2" : "w-full"
                )}
              >
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "content" | "automation")} className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-6 pt-4 pb-0 border-b shrink-0">
                    <TabsList className="w-full grid grid-cols-2">
                      <TabsTrigger value="content" className="gap-2">
                        <FileEdit className="h-3.5 w-3.5" />
                        Content
                      </TabsTrigger>
                      <TabsTrigger value="automation" className="gap-2">
                        <Settings2 className="h-3.5 w-3.5" />
                        Automation
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Content Tab */}
                  <TabsContent value="content" className="flex-1 overflow-y-auto p-6 space-y-5 mt-0">
                    {/* Subject Line */}
                    <div className="space-y-2">
                      <Label htmlFor="subject" className="text-sm font-medium">
                        Subject Line
                      </Label>
                      <Input
                        id="subject"
                        value={editForm.subject}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, subject: e.target.value }))
                        }
                        placeholder="Enter email subject..."
                        className="text-sm"
                      />
                    </div>

                    {/* Placeholder Tray */}
                    <PlaceholderTray
                      placeholders={editingTemplate.placeholders as PlaceholderItem[]}
                    />

                    {/* Rich Text Editor */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Email Content</Label>
                      <RichTextEditor
                        content={editForm.body}
                        onChange={(html) => setEditForm((prev) => ({ ...prev, body: html }))}
                        placeholder="Start writing your email..."
                      />
                    </div>
                  </TabsContent>

                  {/* Automation Tab */}
                  <TabsContent value="automation" className="flex-1 overflow-y-auto p-6 mt-0">
                    <AutomationSettings
                      templateKey={editingTemplate.templateKey}
                      settings={automationSettings}
                      onChange={setAutomationSettings}
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Preview Panel */}
              {showPreview && (
                <div className="w-1/2 flex flex-col overflow-hidden bg-slate-50">
                  <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Live Preview</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Sample Data Applied
                    </Badge>
                  </div>
                  <div className="flex-1 overflow-hidden p-4">
                    <div className="h-full rounded-lg border bg-white overflow-hidden shadow-sm">
                      <EmailPreview
                        subject={editForm.subject}
                        body={editForm.body}
                        placeholders={editingTemplate.placeholders as PlaceholderItem[]}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog
        open={testEmailDialog.open}
        onOpenChange={(open) =>
          !open && setTestEmailDialog({ open: false, templateKey: "", templateName: "" })
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send Test Email
            </DialogTitle>
            <DialogDescription>
              Send a test "{testEmailDialog.templateName}" email with sample data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-email">Recipient Email</Label>
              <Input
                id="test-email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="test@example.com"
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Test Email Notice</p>
                  <p className="text-xs text-amber-700 mt-1">
                    This will send a real email with sample placeholder data. Subject will be
                    prefixed with [TEST].
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setTestEmailDialog({ open: false, templateKey: "", templateName: "" })
              }
            >
              Cancel
            </Button>
            <Button onClick={handleSendTest} disabled={testMutation.isPending || !testEmail}>
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Test Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog
        open={resetConfirmDialog.open}
        onOpenChange={(open) =>
          !open && setResetConfirmDialog({ open: false, templateKey: "", templateName: "" })
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset Template
            </DialogTitle>
            <DialogDescription>
              This will reset "{resetConfirmDialog.templateName}" to its default content.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Warning</p>
                <p className="text-xs text-amber-700 mt-1">
                  Any customizations you've made to this template will be lost. This action
                  cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setResetConfirmDialog({ open: false, templateKey: "", templateName: "" })
              }
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                resetMutation.mutate(resetConfirmDialog.templateKey);
                // Also update edit form if we're editing this template
                if (editingTemplate?.templateKey === resetConfirmDialog.templateKey) {
                  setEditingTemplate(null);
                }
              }}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reset to Default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
