import { Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useSession, signOut } from "@/lib/auth-client";
import { PROPERTY, IMAGES } from "@/lib/constants";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  Home as HomeIcon,
  CreditCard,
  FileText,
  Receipt,
  Wrench,
  LogOut,
  Menu,
  X,
  Home,
  Settings,
  Building2,
  FileStack,
  ChevronDown,
  Book,
  Info,
  Shield,
  ClipboardCheck,
  ClipboardList,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Portal pages
import TenantDashboard from "./TenantDashboard";
import TenantInvoices from "./TenantInvoices";
import TenantPayments from "./TenantPayments";
import TenantServiceRequests from "./TenantServiceRequests";
import TenantAnnouncements from "./TenantAnnouncements";
import TenantInsurance from "./TenantInsurance";
import TenantDocuments from "./TenantDocuments";
import TenantSettings from "./TenantSettings";
import TenantChecklists from "./TenantChecklists";
import TenantInspections from "./TenantInspections";
import TenantUnitManuals from "./TenantUnitManuals";
import TenantMyUnit from "./TenantMyUnit";
import TenantCalendar from "./TenantCalendar";

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

// Storage key for persisting expanded state
const SIDEBAR_STATE_KEY = "tenant-sidebar-expanded";

// Navigation structure
const NAV_STRUCTURE: NavEntry[] = [
  { to: "/portal", icon: HomeIcon, label: "Home", end: true },
  {
    id: "payments",
    icon: CreditCard,
    label: "Payments",
    items: [
      { to: "/portal/invoices", icon: FileText, label: "Invoices" },
      { to: "/portal/payments", icon: Receipt, label: "Payment History" },
    ],
  },
  {
    id: "my-unit",
    icon: Building2,
    label: "My Unit",
    items: [
      { to: "/portal/my-unit", icon: Info, label: "Unit Details" },
      { to: "/portal/unit-manuals", icon: Book, label: "Unit Documents" },
    ],
  },
  {
    id: "documents",
    icon: FileStack,
    label: "My Documents",
    items: [
      { to: "/portal/checklists", icon: ClipboardList, label: "Checklists" },
      { to: "/portal/inspections", icon: ClipboardCheck, label: "Inspections" },
      { to: "/portal/documents", icon: FileText, label: "Lease & Files" },
      { to: "/portal/insurance", icon: Shield, label: "Insurance" },
    ],
  },
  { to: "/portal/requests", icon: Wrench, label: "Requests" },
  { to: "/portal/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/portal/settings", icon: Settings, label: "Settings" },
];

// Get all routes that belong to a group for auto-expand logic
function getGroupRoutes(group: NavGroup): string[] {
  return group.items.map((item) => item.to);
}

// Check if current path matches any route in the group
function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => {
    if (item.end) {
      return pathname === item.to;
    }
    return pathname === item.to || pathname.startsWith(item.to + "/");
  });
}

interface CollapsibleNavGroupProps {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
  onItemClick?: () => void;
}

function CollapsibleNavGroup({ group, isOpen, onToggle, onItemClick }: CollapsibleNavGroupProps) {
  const location = useLocation();
  const isChildActive = isGroupActive(group, location.pathname);

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          isChildActive
            ? "bg-sidebar-accent/50 text-sidebar-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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

export default function TenantPortal() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const previousPathRef = useRef<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    // Load persisted state from localStorage
    try {
      const saved = localStorage.getItem(SIDEBAR_STATE_KEY);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {
      // Ignore parse errors
    }
    return new Set();
  });

  // Auto-expand groups only when navigating TO a new child route
  useEffect(() => {
    const previousPath = previousPathRef.current;
    const currentPath = location.pathname;

    // Only run auto-expand logic when the path actually changes
    if (previousPath !== currentPath) {
      NAV_STRUCTURE.forEach((entry) => {
        if (isNavGroup(entry)) {
          const wasChildActive = previousPath ? isGroupActive(entry, previousPath) : false;
          const isChildActive = isGroupActive(entry, currentPath);

          // Only auto-expand if navigating INTO this group (not already in it)
          if (isChildActive && !wasChildActive && !openGroups.has(entry.id)) {
            setOpenGroups((prev) => {
              const next = new Set([...prev, entry.id]);
              try {
                localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify([...next]));
              } catch {
                // Ignore storage errors
              }
              return next;
            });
          }
        }
      });

      previousPathRef.current = currentPath;
    }
  }, [location.pathname, openGroups]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      // Persist to localStorage
      try {
        localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify([...next]));
      } catch {
        // Ignore storage errors
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
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-primary"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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
            className="h-28 w-auto brightness-0 invert mb-2"
          />
          <p className="text-xs text-sidebar-foreground/60">Tenant Portal</p>
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
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {session?.user?.email}
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
            {PROPERTY.name}
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
          <Routes>
            {/* Home - Dashboard with alerts & announcements */}
            <Route index element={<TenantDashboard />} />

            {/* Payments - Invoices, pay rent, history */}
            <Route path="payments" element={<TenantPayments />} />
            <Route path="invoices" element={<TenantInvoices />} />

            {/* My Unit - Unit info, appliances, building info */}
            <Route path="my-unit" element={<TenantMyUnit />} />
            <Route path="unit-manuals" element={<TenantUnitManuals />} />

            {/* My Documents - Lease, insurance, checklists, inspections */}
            <Route path="documents" element={<TenantDocuments />} />
            <Route path="insurance" element={<TenantInsurance />} />
            <Route path="checklists" element={<TenantChecklists />} />
            <Route path="inspections" element={<TenantInspections />} />
            {/* Legacy routes for backwards compatibility */}
            <Route path="checklist" element={<TenantChecklists />} />
            <Route path="move-out-checklist" element={<TenantChecklists />} />

            {/* Requests - Service requests */}
            <Route path="requests/*" element={<TenantServiceRequests />} />
            <Route path="service-requests/*" element={<TenantServiceRequests />} />

            {/* Calendar */}
            <Route path="calendar" element={<TenantCalendar />} />

            {/* Settings */}
            <Route path="settings" element={<TenantSettings />} />

            {/* Legacy routes for backwards compatibility */}
            <Route path="announcements" element={<TenantAnnouncements />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
