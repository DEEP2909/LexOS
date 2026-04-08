"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useAuthStore } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function MfaDialog() {
  const router = useRouter();
  const { mfaRequired, verifyMfa, error, clearError } = useAuthStore();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    clearError();
    setIsSubmitting(true);

    try {
      const success = await verifyMfa(code);
      if (success) {
        toast.success("MFA verified successfully!");
        router.push("/dashboard");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={mfaRequired} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            Two-Factor Authentication
          </DialogTitle>
          <DialogDescription className="text-center">
            Enter the 6-digit code from your authenticator app
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg text-center"
            >
              {error}
            </motion.div>
          )}

          <div className="space-y-2">
            <Label htmlFor="mfa-code" className="sr-only">
              Authentication Code
            </Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center text-2xl tracking-widest font-mono"
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={code.length !== 6 || isSubmitting}
            variant="gold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify"
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Having trouble?{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => toast.info("Contact your administrator for help")}
            >
              Get help
            </button>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
