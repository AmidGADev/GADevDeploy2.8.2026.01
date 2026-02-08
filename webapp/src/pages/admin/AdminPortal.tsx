import { Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useSession, signOut } from "@/lib/auth-client";
import { IMAGES, COMPANY } from "@/lib/constants";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  Wrench,
  Bell,
  Mail,
  LogOut,
  Menu,
  X,
  Home,
  Banknote,
  Settings,
  Shield,
  Info,
  ChevronDown,
  DollarSign,
  Cog,
  ClipboardCheck,
  ClipboardList,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";

// Eagerly loaded components (small, frequently used)
import Dashboard from "./Dashboard";

// Lazy loaded components (large pages)
const UnitsPage = lazy(() => import("./UnitsPage"));
const TenantsPage = lazy(() => import("./TenantsPage"));
const InvoicesPage = lazy(() => import("./InvoicesPage"));
const RequestsPage = lazy(() => import("./RequestsPage"));
const AnnouncementsPage = lazy(() => import("./AnnouncementsPage"));
const EmailPage = lazy(() => import("./EmailPage"));
const EtransferPaymentsPage = lazy(() => import("./EtransferPaymentsPage"));
const AdminSettings = lazy(() => import("./AdminSettings"));
const InsurancePage = lazy(() => import("./InsurancePage"));
const BuildingInfoPage = lazy(() => import("./BuildingInfoPage"));
const TenantChecklistPage = lazy(() => import("./TenantChecklistPage"));
const MoveOutChecklistPage = lazy(() => import("./MoveOutChecklistPage"));
const ComplianceChecklistsPage = lazy(() => import("./ComplianceChecklistsPage"));
const ComplianceInspectionsPage = lazy(() => import("./ComplianceInspectionsPage"));
const TenantMoveOutChecklistPage = lazy(() => import("./TenantMoveOutChecklistPage"));
const TenantInspectionPage = lazy(() => import("./TenantInspectionPage"));
const AdminCalendar = lazy(() => import("./AdminCalendar"));

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
}

interface NavGroup {
  id: string;
  icon: LucideIcon;
  label: string;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

// Grouped navigation structure
const NAV_STRUCTURE: NavEntry[] = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/units", icon: Building2, label: "Units" },
  { to: "/admin/tenants", icon: Users, label: "Tenants" },
  {
    id: "financials",
    icon: DollarSign,
    label: "Financials",
    items: [
      { to: "/admin/invoices", icon: FileText, label: "Invoices" },
      { to: "/admin/etransfer", icon: Banknote, label: "e-Transfers" },
    ],
  },
  {
    id: "operations",
    icon: Cog,
    label: "Operations",
    items: [
      { to: "/admin/requests", icon: Wrench, label: "Requests" },
      { to: "/admin/announcements", icon: Bell, label: "Announcements" },
      { to: "/admin/building-info", icon: Info, label: "Building Info" },
      { to: "/admin/email", icon: Mail, label: "Send Email" },
    ],
  },
  {
    id: "compliance",
    icon: Shield,
    label: "Compliance",
    items: [
      { to: "/admin/compliance/checklists", icon: ClipboardList, label: "Checklists" },
      { to: "/admin/compliance/inspections", icon: ClipboardCheck, label: "Inspections" },
      { to: "/admin/insurance", icon: Shield, label: "Insurance" },
    ],
  },
  { to: "/admin/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

interface CollapsibleNavGroupProps {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  onItemClick?: () => void;
}

function CollapsibleNavGroup({ group, isOpen, onToggle, onItemClick }: CollapsibleNavGroupProps) {
  const location = useLocation();
  const isChildActive = group.items.some((item) => location.pathname === item.to);

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
          isChildActive
            ? "bg-sidebar-accent/50 text-sidebar-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <span className="flex items-center gap-3">
          <group.icon size={18} />
          {group.label}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-in-out",
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="ml-3 mt-1 space-y-0.5 border-l border-sidebar-border/50 pl-3">
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onItemClick}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminPortal() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Auto-expand groups when a child route is active
  useEffect(() => {
    NAV_STRUCTURE.forEach((entry) => {
      if (isNavGroup(entry)) {
        const isChildActive = entry.items.some((item) => location.pathname === item.to);
        if (isChildActive) {
          setOpenGroups((prev) => new Set([...prev, entry.id]));
        }
      }
    });
  }, [location.pathname]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const renderNavItem = (item: NavItem, onItemClick?: () => void) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={onItemClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )
      }
    >
      <item.icon size={18} />
      {item.label}
    </NavLink>
  );

  const renderNavEntry = (entry: NavEntry, onItemClick?: () => void) => {
    if (isNavGroup(entry)) {
      return (
        <CollapsibleNavGroup
          key={entry.id}
          group={entry}
          isOpen={openGroups.has(entry.id)}
          onToggle={() => toggleGroup(entry.id)}
          onItemClick={onItemClick}
        />
      );
    }
    return renderNavItem(entry, onItemClick);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-sidebar border-r border-sidebar-border">
        {/* Logo */}
        <div className="p-8 border-b border-sidebar-border">
          <img
            src={IMAGES.logo}
            alt="GA Developments"
            className="h-28 w-auto brightness-0 invert"
          />
          <p className="text-xs text-sidebar-foreground/60 mt-3">Admin Portal</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {NAV_STRUCTURE.map((entry) => renderNavEntry(entry))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="mb-3">
            <p className="text-sm font-medium text-sidebar-foreground">
              {session?.user?.name}
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              Administrator
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground"
              onClick={() => navigate("/")}
            >
              <Home size={16} className="mr-2" />
              Home
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-sidebar-foreground/70 hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center justify-between p-4">
          <h1 className="font-serif text-lg font-semibold text-sidebar-foreground">
            {COMPANY.name}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </Button>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="p-4 border-t border-sidebar-border max-h-[70vh] overflow-y-auto">
            <nav className="space-y-1">
              {NAV_STRUCTURE.map((entry) =>
                renderNavEntry(entry, () => setIsMobileMenuOpen(false))
              )}
            </nav>
            <div className="mt-4 pt-4 border-t border-sidebar-border flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-sidebar-foreground/70"
                onClick={() => {
                  navigate("/");
                  setIsMobileMenuOpen(false);
                }}
              >
                <Home size={16} className="mr-2" />
                Home
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-sidebar-foreground/70 hover:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut size={16} className="mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-64">
        <div className="p-6 pt-20 lg:pt-6">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="units" element={<UnitsPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="calendar" element={<AdminCalendar />} />
              <Route path="tenants/:tenantId/checklist" element={<TenantChecklistPage />} />
              <Route path="tenants/:tenantId/move-out-checklist" element={<MoveOutChecklistPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="etransfer" element={<EtransferPaymentsPage />} />
              <Route path="requests" element={<RequestsPage />} />
              <Route path="service-requests" element={<RequestsPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
              <Route path="building-info" element={<BuildingInfoPage />} />
              <Route path="email" element={<EmailPage />} />
              <Route path="compliance/checklists" element={<ComplianceChecklistsPage />} />
              <Route path="compliance/inspections" element={<ComplianceInspectionsPage />} />
              <Route path="tenants/:tenantId/checklist/move-out" element={<TenantMoveOutChecklistPage />} />
              <Route path="tenants/:tenantId/inspection/:inspectionType" element={<TenantInspectionPage />} />
              <Route path="insurance" element={<InsurancePage />} />
              <Route path="settings" element={<AdminSettings />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
