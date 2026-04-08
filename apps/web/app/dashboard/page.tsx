"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  FileText,
  Flag,
  FolderOpen,
  LogOut,
  Moon,
  Plus,
  Scale,
  Search,
  Settings,
  Sun,
  TrendingUp,
  User,
  AlertTriangle,
  Clock,
  CheckCircle,
} from "lucide-react";
import { useTheme } from "next-themes";

import { useAuthStore } from "@/lib/auth";
import { matters, analytics } from "@/lib/api";
import { formatRelativeTime, getRiskColor } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, checkAuth, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  // Fetch dashboard data
  const { data: mattersData } = useQuery({
    queryKey: ["matters", { status: "active", limit: 5 }],
    queryFn: () => matters.list({ status: "active", limit: 5 }),
    enabled: isAuthenticated,
  });

  const { data: overviewData } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => analytics.firmOverview(),
    enabled: isAuthenticated,
  });

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const stats = [
    {
      title: "Active Matters",
      value: overviewData?.activeMatters || 0,
      change: "+12%",
      icon: FolderOpen,
      color: "text-blue-500",
    },
    {
      title: "Documents",
      value: overviewData?.totalDocuments || 0,
      change: `+${overviewData?.documentsThisMonth || 0} this month`,
      icon: FileText,
      color: "text-green-500",
    },
    {
      title: "Flags Resolved",
      value: overviewData?.flagsResolved || 0,
      change: "Last 30 days",
      icon: Flag,
      color: "text-amber-500",
    },
    {
      title: "Avg Processing",
      value: `${overviewData?.avgProcessingTime || 0}s`,
      change: "Per document",
      icon: Clock,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-[hsl(var(--navy))] flex items-center justify-center">
                <Scale className="h-5 w-5 text-[hsl(var(--gold))]" />
              </div>
              <span className="text-xl font-bold">LexOS</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2 text-primary"
            >
              <BarChart3 className="h-5 w-5" />
              Dashboard
            </Link>
            <Link
              href="/matters"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <FolderOpen className="h-5 w-5" />
              Matters
            </Link>
            <Link
              href="/research"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Search className="h-5 w-5" />
              Research
            </Link>
            <Link
              href="/analytics"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <TrendingUp className="h-5 w-5" />
              Analytics
            </Link>
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Settings className="h-5 w-5" />
              Admin
            </Link>
          </nav>

          {/* User section */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "Attorney"}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => logout()}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="pl-64">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-full items-center justify-between px-6">
            <div>
              <h1 className="text-xl font-semibold">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Welcome back, {user?.name?.split(" ")[0] || "Counselor"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search matters..." className="w-64 pl-9" />
              </div>
              <Button variant="outline" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon">
                <Bell className="h-4 w-4" />
              </Button>
              <Button variant="gold">
                <Plus className="h-4 w-4 mr-2" />
                New Matter
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">{stat.change}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Active Matters */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Active Matters</CardTitle>
                    <CardDescription>Your most recent active matters</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/matters">View all</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mattersData?.items?.map((matter, index) => (
                    <motion.div
                      key={matter.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        href={`/matters/${matter.id}`}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FolderOpen className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{matter.name}</p>
                            <p className="text-sm text-muted-foreground">{matter.clientName}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge variant={matter.status === "active" ? "active" : "secondary"}>
                            {matter.status}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatRelativeTime(matter.updatedAt)}
                          </p>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                  {!mattersData?.items?.length && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No active matters</p>
                      <Button variant="outline" className="mt-4">
                        <Plus className="h-4 w-4 mr-2" />
                        Create your first matter
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Urgent Flags */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Urgent Flags
                </CardTitle>
                <CardDescription>Requires immediate attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Sample urgent flags */}
                  {[
                    { title: "Unlimited indemnification", risk: "critical", matter: "Acme Corp MSA" },
                    { title: "No liability cap", risk: "critical", matter: "Tech Vendor Agreement" },
                    { title: "CA non-compete clause", risk: "high", matter: "Employment Agreement" },
                  ].map((flag, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                    >
                      <div
                        className="h-2 w-2 rounded-full mt-2"
                        style={{ backgroundColor: getRiskColor(flag.risk) }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{flag.title}</p>
                        <p className="text-xs text-muted-foreground">{flag.matter}</p>
                      </div>
                      <Badge variant={flag.risk as "critical" | "high" | "medium" | "low"}>
                        {flag.risk}
                      </Badge>
                    </motion.div>
                  ))}
                </div>
                <Button variant="outline" className="w-full mt-4" asChild>
                  <Link href="/flags">View all flags</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* AI Processing Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Document Processing Queue
              </CardTitle>
              <CardDescription>AI analysis status for recent uploads</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "Vendor Agreement v2.pdf", status: "completed", progress: 100 },
                  { name: "NDA - Client Corp.docx", status: "processing", progress: 65 },
                  { name: "Employment Contract.pdf", status: "processing", progress: 30 },
                  { name: "Lease Agreement.pdf", status: "pending", progress: 0 },
                ].map((doc, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            doc.status === "completed"
                              ? "bg-green-500"
                              : doc.status === "processing"
                              ? "bg-blue-500 ai-pulse"
                              : "bg-gray-300"
                          }`}
                          style={{ width: `${doc.progress}%` }}
                        />
                      </div>
                    </div>
                    <Badge variant={doc.status as "completed" | "processing" | "pending"}>
                      {doc.status === "completed" && <CheckCircle className="h-3 w-3 mr-1" />}
                      {doc.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Disclaimer */}
          <div className="text-center text-sm text-muted-foreground">
            <p>
              AI-generated analysis — requires attorney review
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
