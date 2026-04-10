'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2,
  Globe,
  Shield,
  Key,
  Bell,
  Palette,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface TenantSettings {
  // General
  name: string;
  slug: string;
  domain?: string;
  logo?: string;
  // Security
  mfaRequired: boolean;
  sessionTimeout: number; // minutes
  ipAllowlist?: string[];
  // SSO
  ssoEnabled: boolean;
  ssoProvider?: 'okta' | 'azure' | 'google' | 'custom';
  ssoConfig?: Record<string, string>;
  // Notifications
  emailNotifications: boolean;
  slackWebhook?: string;
  // Branding
  primaryColor?: string;
  accentColor?: string;
}

interface TenantSettingsProps {
  settings: TenantSettings;
  onSave: (settings: Partial<TenantSettings>) => Promise<void>;
  isOwner: boolean;
}

export function TenantSettingsPanel({
  settings,
  onSave,
  isOwner,
}: TenantSettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const updateSetting = <K extends keyof TenantSettings>(
    key: K,
    value: TenantSettings[K]
  ) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(localSettings);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Organization Settings</h2>
          <p className="text-muted-foreground">
            Manage your organization&apos;s configuration and security
          </p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">
            <Building2 className="h-4 w-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="sso">
            <Key className="h-4 w-4 mr-2" />
            SSO
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="branding">
            <Palette className="h-4 w-4 mr-2" />
            Branding
          </TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>
                Basic information about your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Organization Name</Label>
                  <Input
                    id="name"
                    value={localSettings.name}
                    onChange={(e) => updateSetting('name', e.target.value)}
                    disabled={!isOwner}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input
                    id="slug"
                    value={localSettings.slug}
                    onChange={(e) => updateSetting('slug', e.target.value)}
                    disabled={!isOwner}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your URL: app.evidentis.tech/{localSettings.slug}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Custom Domain (Optional)</Label>
                <Input
                  id="domain"
                  placeholder="legal.yourcompany.com"
                  value={localSettings.domain || ''}
                  onChange={(e) => updateSetting('domain', e.target.value)}
                  disabled={!isOwner}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Configure security policies for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Require MFA</Label>
                  <p className="text-sm text-muted-foreground">
                    All users must enable multi-factor authentication
                  </p>
                </div>
                <Switch
                  checked={localSettings.mfaRequired}
                  onCheckedChange={(v) => updateSetting('mfaRequired', v)}
                  disabled={!isOwner}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Session Timeout</Label>
                <Select
                  value={String(localSettings.sessionTimeout)}
                  onValueChange={(v) => updateSetting('sessionTimeout', parseInt(v))}
                  disabled={!isOwner}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="240">4 hours</SelectItem>
                    <SelectItem value="480">8 hours</SelectItem>
                    <SelectItem value="1440">24 hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>IP Allowlist</Label>
                <p className="text-sm text-muted-foreground">
                  Restrict access to specific IP addresses
                </p>
                <Input
                  placeholder="e.g., 192.168.1.0/24, 10.0.0.1"
                  value={localSettings.ipAllowlist?.join(', ') || ''}
                  onChange={(e) =>
                    updateSetting(
                      'ipAllowlist',
                      e.target.value.split(',').map((ip) => ip.trim()).filter(Boolean)
                    )
                  }
                  disabled={!isOwner}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SSO Tab */}
        <TabsContent value="sso">
          <Card>
            <CardHeader>
              <CardTitle>Single Sign-On (SSO)</CardTitle>
              <CardDescription>
                Configure enterprise SSO for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Enable SSO</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow users to sign in with your identity provider
                  </p>
                </div>
                <Switch
                  checked={localSettings.ssoEnabled}
                  onCheckedChange={(v) => updateSetting('ssoEnabled', v)}
                  disabled={!isOwner}
                />
              </div>
              {localSettings.ssoEnabled && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Identity Provider</Label>
                    <Select
                      value={localSettings.ssoProvider}
                      onValueChange={(v) =>
                        updateSetting('ssoProvider', v as TenantSettings['ssoProvider'])
                      }
                      disabled={!isOwner}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="okta">Okta</SelectItem>
                        <SelectItem value="azure">Azure AD</SelectItem>
                        <SelectItem value="google">Google Workspace</SelectItem>
                        <SelectItem value="custom">Custom SAML</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      SSO configuration requires additional setup. Contact support for
                      assistance.
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure how your organization receives notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Email Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
                <Switch
                  checked={localSettings.emailNotifications}
                  onCheckedChange={(v) => updateSetting('emailNotifications', v)}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Slack Webhook URL</Label>
                <Input
                  type="url"
                  placeholder="https://hooks.slack.com/services/..."
                  value={localSettings.slackWebhook || ''}
                  onChange={(e) => updateSetting('slackWebhook', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Receive notifications in your Slack channel
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branding Tab */}
        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
              <CardDescription>
                Customize the look and feel for your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={localSettings.primaryColor || '#0066cc'}
                      onChange={(e) => updateSetting('primaryColor', e.target.value)}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={localSettings.primaryColor || '#0066cc'}
                      onChange={(e) => updateSetting('primaryColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Accent Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={localSettings.accentColor || '#ff6600'}
                      onChange={(e) => updateSetting('accentColor', e.target.value)}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={localSettings.accentColor || '#ff6600'}
                      onChange={(e) => updateSetting('accentColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input
                  placeholder="https://yourcompany.com/logo.png"
                  value={localSettings.logo || ''}
                  onChange={(e) => updateSetting('logo', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TenantSettingsPanel;
