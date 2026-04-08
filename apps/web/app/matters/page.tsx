"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  Filter,
  FolderOpen,
  MoreVertical,
  Trash2,
  Edit,
  Loader2,
  Scale,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

import { matters, CreateMatterInput } from "@/lib/api";
import { formatDate, US_STATES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const createMatterSchema = z.object({
  name: z.string().min(1, "Matter name is required"),
  clientName: z.string().min(1, "Client name is required"),
  description: z.string().optional(),
  practiceArea: z.string().optional(),
  jurisdiction: z.string().optional(),
});

type CreateMatterFormData = z.infer<typeof createMatterSchema>;

export default function MattersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateMatterFormData>({
    resolver: zodResolver(createMatterSchema),
  });

  // Fetch matters
  const { data: mattersData, isLoading } = useQuery({
    queryKey: ["matters", { search: searchQuery, status: statusFilter === "all" ? undefined : statusFilter }],
    queryFn: () =>
      matters.list({
        search: searchQuery || undefined,
        status: statusFilter === "all" ? undefined : (statusFilter as "active" | "closed" | "on_hold"),
      }),
  });

  // Create matter mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateMatterInput) => matters.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matters"] });
      setIsCreateDialogOpen(false);
      reset();
      toast.success("Matter created successfully");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create matter");
    },
  });

  // Delete matter mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => matters.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matters"] });
      toast.success("Matter deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete matter");
    },
  });

  const onCreateSubmit = (data: CreateMatterFormData) => {
    createMutation.mutate(data);
  };

  const practiceAreas = [
    "Corporate",
    "Litigation",
    "Real Estate",
    "Employment",
    "Intellectual Property",
    "Tax",
    "Healthcare",
    "Banking & Finance",
    "Environmental",
    "Immigration",
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 h-16 border-b bg-background/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Matters</h1>
              <p className="text-sm text-muted-foreground">
                Manage your legal matters and cases
              </p>
            </div>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gold">
                <Plus className="h-4 w-4 mr-2" />
                New Matter
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Create New Matter</DialogTitle>
                <DialogDescription>
                  Enter the details for the new legal matter
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit(onCreateSubmit)}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Matter Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Acme Corp Acquisition"
                      {...register("name")}
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500">{errors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clientName">Client Name *</Label>
                    <Input
                      id="clientName"
                      placeholder="e.g., Acme Corporation"
                      {...register("clientName")}
                    />
                    {errors.clientName && (
                      <p className="text-sm text-red-500">{errors.clientName.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      placeholder="Brief description of the matter"
                      {...register("description")}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="practiceArea">Practice Area</Label>
                      <select
                        id="practiceArea"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        {...register("practiceArea")}
                      >
                        <option value="">Select...</option>
                        {practiceAreas.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jurisdiction">Jurisdiction</Label>
                      <select
                        id="jurisdiction"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        {...register("jurisdiction")}
                      >
                        <option value="">Select...</option>
                        {US_STATES.map((state) => (
                          <option key={state.code} value={state.code}>
                            {state.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="gold" disabled={createMutation.isPending}>
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Matter"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Content */}
      <main className="p-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search matters..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {["all", "active", "closed", "on_hold"].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
              >
                {status === "all" ? "All" : status.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}
              </Button>
            ))}
          </div>
        </div>

        {/* Matters Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : mattersData?.items?.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence>
              {mattersData.items.map((matter, index) => (
                <motion.div
                  key={matter.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div
                          className="flex-1"
                          onClick={() => router.push(`/matters/${matter.id}`)}
                        >
                          <CardTitle className="text-lg group-hover:text-primary transition-colors">
                            {matter.name}
                          </CardTitle>
                          <CardDescription>{matter.clientName}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              matter.status === "active"
                                ? "active"
                                : matter.status === "closed"
                                ? "secondary"
                                : "pending"
                            }
                          >
                            {matter.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this matter?")) {
                                deleteMutation.mutate(matter.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent onClick={() => router.push(`/matters/${matter.id}`)}>
                      {matter.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {matter.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {matter.practiceArea && (
                          <span className="flex items-center gap-1">
                            <Scale className="h-3 w-3" />
                            {matter.practiceArea}
                          </span>
                        )}
                        {matter.jurisdiction && (
                          <span>{matter.jurisdiction}</span>
                        )}
                      </div>
                      <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                        <span>Created {formatDate(matter.createdAt)}</span>
                        <span>Updated {formatDate(matter.updatedAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <Card className="py-12">
            <CardContent className="text-center">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No matters found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery
                  ? "No matters match your search criteria"
                  : "Get started by creating your first matter"}
              </p>
              {!searchQuery && (
                <Button variant="gold" onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Matter
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pagination info */}
        {mattersData?.total && mattersData.total > 0 && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Showing {mattersData.items?.length || 0} of {mattersData.total} matters
          </div>
        )}
      </main>
    </div>
  );
}
