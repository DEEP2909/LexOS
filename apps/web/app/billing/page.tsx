"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Loader2,
  CreditCard,
  FileText,
  ArrowUpRight,
  Check,
  AlertCircle,
  Zap,
  Building2,
  Users,
  HardDrive,
  Bot
} from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface BillingInfo {
  plan: {
    name: string;
    tier: "solo" | "team" | "firm" | "enterprise";
    price: number;
    billingCycle: "monthly" | "annual";
  };
  usage: {
    documents: { used: number; limit: number };
    storage: { used: number; limit: number };
    aiQueries: { used: number; limit: number };
    users: { used: number; limit: number };
  };
  subscription: {
    status: "active" | "past_due" | "canceled" | "trialing";
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
  invoices: Array<{
    id: string;
    date: string;
    amount: number;
    status: "paid" | "open" | "void";
    pdfUrl: string;
  }>;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
}

const plans = [
  {
    name: "Solo",
    tier: "solo" as const,
    price: 49,
    description: "Perfect for solo practitioners",
    features: [
      "1 user",
      "100 documents/month",
      "10GB storage",
      "1,000 AI queries/month",
      "Email support",
    ],
  },
  {
    name: "Team",
    tier: "team" as const,
    price: 149,
    description: "Ideal for small law firms",
    features: [
      "Up to 5 users",
      "500 documents/month",
      "50GB storage",
      "5,000 AI queries/month",
      "Priority support",
      "Matter sharing",
    ],
    popular: true,
  },
  {
    name: "Firm",
    tier: "firm" as const,
    price: 399,
    description: "Built for growing firms",
    features: [
      "Up to 25 users",
      "2,000 documents/month",
      "200GB storage",
      "25,000 AI queries/month",
      "Phone support",
      "SSO/SAML",
      "Custom workflows",
    ],
  },
  {
    name: "Enterprise",
    tier: "enterprise" as const,
    price: 0,
    description: "Tailored for large organizations",
    features: [
      "Unlimited users",
      "Unlimited documents",
      "Unlimited storage",
      "Unlimited AI queries",
      "Dedicated support",
      "On-premise option",
      "Custom integrations",
      "SLA guarantee",
    ],
  },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 GB";
  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(1) + " GB";
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BillingPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [isManagingBilling, setIsManagingBilling] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    async function fetchBilling() {
      try {
        const response = await fetch("/api/billing");
        if (!response.ok) throw new Error("Failed to fetch billing");
        const result = await response.json();
        setBilling(result.data);
      } catch (err) {
        toast.error("Failed to load billing information");
      } finally {
        setIsLoading(false);
      }
    }
    fetchBilling();
  }, [isAuthenticated, router]);

  const handleManageBilling = async () => {
    setIsManagingBilling(true);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to create portal session");
      const result = await response.json();
      window.location.href = result.data.url;
    } catch (err) {
      toast.error("Failed to open billing portal");
      setIsManagingBilling(false);
    }
  };

  const handleUpgrade = async (tier: string) => {
    try {
      const response = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!response.ok) throw new Error("Failed to start upgrade");
      const result = await response.json();
      window.location.href = result.data.checkoutUrl;
    } catch (err) {
      toast.error("Failed to start upgrade process");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const usagePercentage = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">Billing & Subscription</h1>
              <p className="text-muted-foreground mt-1">
                Manage your plan, usage, and payment methods
              </p>
            </div>
            <Button onClick={handleManageBilling} disabled={isManagingBilling}>
              {isManagingBilling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Manage Billing
            </Button>
          </div>

          {/* Current Plan */}
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Current Plan
                    {billing?.subscription.status === "trialing" && (
                      <Badge variant="secondary">Trial</Badge>
                    )}
                    {billing?.subscription.status === "past_due" && (
                      <Badge variant="destructive">Past Due</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {billing?.subscription.cancelAtPeriodEnd
                      ? `Cancels on ${formatDate(billing.subscription.currentPeriodEnd)}`
                      : `Renews on ${billing?.subscription.currentPeriodEnd ? formatDate(billing.subscription.currentPeriodEnd) : "N/A"}`}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold">
                    ${billing?.plan.price}
                    <span className="text-lg font-normal text-muted-foreground">/mo</span>
                  </p>
                  <p className="text-sm text-muted-foreground capitalize">
                    {billing?.plan.name} Plan
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {billing?.paymentMethod && (
                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium capitalize">
                      {billing.paymentMethod.brand} •••• {billing.paymentMethod.last4}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expires {billing.paymentMethod.expMonth}/{billing.paymentMethod.expYear}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Usage This Period</CardTitle>
              <CardDescription>
                Track your resource consumption
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Documents
                    </span>
                    <span>
                      {billing?.usage.documents.used.toLocaleString()} / {billing?.usage.documents.limit.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={usagePercentage(billing?.usage.documents.used || 0, billing?.usage.documents.limit || 1)} 
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-muted-foreground" />
                      Storage
                    </span>
                    <span>
                      {formatBytes(billing?.usage.storage.used || 0)} / {formatBytes(billing?.usage.storage.limit || 0)}
                    </span>
                  </div>
                  <Progress 
                    value={usagePercentage(billing?.usage.storage.used || 0, billing?.usage.storage.limit || 1)} 
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      AI Queries
                    </span>
                    <span>
                      {billing?.usage.aiQueries.used.toLocaleString()} / {billing?.usage.aiQueries.limit.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={usagePercentage(billing?.usage.aiQueries.used || 0, billing?.usage.aiQueries.limit || 1)} 
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Users
                    </span>
                    <span>
                      {billing?.usage.users.used} / {billing?.usage.users.limit}
                    </span>
                  </div>
                  <Progress 
                    value={usagePercentage(billing?.usage.users.used || 0, billing?.usage.users.limit || 1)} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Available Plans */}
          <h2 className="text-xl font-bold mb-4">Available Plans</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {plans.map((plan) => (
              <Card 
                key={plan.tier} 
                className={`relative ${plan.popular ? "border-primary shadow-lg" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="default" className="bg-primary">
                      <Zap className="h-3 w-3 mr-1" />
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    {plan.price > 0 ? (
                      <p className="text-3xl font-bold">
                        ${plan.price}
                        <span className="text-lg font-normal text-muted-foreground">/mo</span>
                      </p>
                    ) : (
                      <p className="text-3xl font-bold">Custom</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {billing?.plan.tier === plan.tier ? (
                    <Button className="w-full" variant="outline" disabled>
                      Current Plan
                    </Button>
                  ) : plan.tier === "enterprise" ? (
                    <Button className="w-full" variant="outline" asChild>
                      <a href="mailto:sales@evidentis.tech">
                        Contact Sales
                        <ArrowUpRight className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                  ) : (
                    <Button 
                      className="w-full" 
                      variant={plan.popular ? "gold" : "outline"}
                      onClick={() => handleUpgrade(plan.tier)}
                    >
                      {plans.findIndex(p => p.tier === billing?.plan.tier) < plans.findIndex(p => p.tier === plan.tier)
                        ? "Upgrade"
                        : "Downgrade"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Invoice History */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice History</CardTitle>
              <CardDescription>
                Download past invoices for your records
              </CardDescription>
            </CardHeader>
            <CardContent>
              {billing?.invoices.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No invoices yet
                </p>
              ) : (
                <div className="space-y-2">
                  {billing?.invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{formatDate(invoice.date)}</p>
                          <p className="text-sm text-muted-foreground">
                            ${invoice.amount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          variant={
                            invoice.status === "paid"
                              ? "default"
                              : invoice.status === "open"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {invoice.status}
                        </Badge>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                            Download
                          </a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
