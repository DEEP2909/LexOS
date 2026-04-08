'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Users, Shield, Key, Building2, CreditCard, Webhook, FileText, Plus, Search, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';

type AdminTab = 'team' | 'security' | 'billing' | 'sso' | 'playbooks' | 'webhooks';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('team');

  const tabs = [
    { id: 'team' as const, label: 'Team Members', icon: Users },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'billing' as const, label: 'Billing', icon: CreditCard },
    { id: 'sso' as const, label: 'SSO / SCIM', icon: Key },
    { id: 'playbooks' as const, label: 'Playbooks', icon: FileText },
    { id: 'webhooks' as const, label: 'Webhooks', icon: Webhook },
  ];

  const teamMembers = [
    { name: 'Sarah Mitchell', email: 'sarah@firm.com', role: 'admin', status: 'active', mfa: true },
    { name: 'John Davidson', email: 'john@firm.com', role: 'attorney', status: 'active', mfa: true },
    { name: 'Emily Chen', email: 'emily@firm.com', role: 'attorney', status: 'active', mfa: false },
    { name: 'Michael Ross', email: 'michael@firm.com', role: 'paralegal', status: 'active', mfa: true },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] text-white">
      <div className="flex">
        <div className="w-64 min-h-screen bg-[#112240] border-r border-slate-700 p-4">
          <div className="flex items-center gap-2 mb-8 px-2">
            <Settings className="h-6 w-6 text-[#C9A84C]" />
            <h1 className="text-xl font-bold">Admin</h1>
          </div>
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === tab.id ? 'bg-[#C9A84C]/20 text-[#C9A84C]' : 'text-slate-400 hover:text-white hover:bg-[#0A1628]'}`}>
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="mt-8 pt-8 border-t border-slate-700">
            <Card className="bg-[#0A1628] border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-[#C9A84C] mb-2">
                  <Building2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Professional Plan</span>
                </div>
                <p className="text-xs text-slate-400 mb-3">100 attorneys • 2,000 docs/mo</p>
                <Button size="sm" variant="outline" className="w-full border-slate-600 text-xs">Manage Plan</Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex-1 p-8">
          {activeTab === 'team' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">Team Members</h2>
                  <p className="text-slate-400">Manage your firm's users and permissions</p>
                </div>
                <Button className="bg-[#C9A84C] hover:bg-[#B8973B] text-[#0A1628]"><Plus className="h-4 w-4 mr-2" />Invite Member</Button>
              </div>
              <Card className="bg-[#112240] border-slate-700">
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left p-4 text-sm font-medium text-slate-400">Member</th>
                        <th className="text-left p-4 text-sm font-medium text-slate-400">Role</th>
                        <th className="text-left p-4 text-sm font-medium text-slate-400">Status</th>
                        <th className="text-left p-4 text-sm font-medium text-slate-400">MFA</th>
                        <th className="text-right p-4 text-sm font-medium text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamMembers.map((member, i) => (
                        <tr key={i} className="border-b border-slate-700/50 last:border-0">
                          <td className="p-4"><div><p className="font-medium">{member.name}</p><p className="text-sm text-slate-400">{member.email}</p></div></td>
                          <td className="p-4"><Badge variant="outline" className={`capitalize ${member.role === 'admin' ? 'border-[#C9A84C] text-[#C9A84C]' : 'border-slate-600'}`}>{member.role}</Badge></td>
                          <td className="p-4"><Badge className="bg-green-500/20 text-green-400">{member.status}</Badge></td>
                          <td className="p-4">{member.mfa ? <ToggleRight className="h-5 w-5 text-green-400" /> : <ToggleLeft className="h-5 w-5 text-slate-500" />}</td>
                          <td className="p-4 text-right"><Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">Edit</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'security' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Security Settings</h2>
              <Card className="bg-[#112240] border-slate-700 mb-4">
                <CardHeader><CardTitle>Multi-Factor Authentication</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-300">Enforce MFA for all team members</p>
                    <Button variant="outline" className="border-slate-600">Enable Requirement</Button>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#112240] border-slate-700">
                <CardHeader><CardTitle>Session Settings</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div><Label className="text-slate-400">Session Timeout</Label><Input type="number" defaultValue={60} className="mt-1 bg-[#0A1628] border-slate-600" /></div>
                  <div><Label className="text-slate-400">Max Failed Logins</Label><Input type="number" defaultValue={5} className="mt-1 bg-[#0A1628] border-slate-600" /></div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'billing' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Billing & Subscription</h2>
              <Card className="bg-[#112240] border-[#C9A84C]">
                <CardContent className="p-6">
                  <Badge className="bg-[#C9A84C] text-[#0A1628] mb-2">Current Plan</Badge>
                  <h3 className="text-2xl font-bold">Professional</h3>
                  <p className="text-slate-400 mt-1">$2,199/month • Billed annually</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-300">
                    <li>✓ Up to 100 attorneys</li>
                    <li>✓ 2,000 documents/month</li>
                    <li>✓ Advanced analytics</li>
                    <li>✓ SSO & SCIM</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'sso' && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Single Sign-On & SCIM</h2>
              <Card className="bg-[#112240] border-slate-700">
                <CardHeader><CardTitle>SAML 2.0 Configuration</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label className="text-slate-400">Identity Provider SSO URL</Label><Input placeholder="https://idp.example.com/sso/saml" className="mt-1 bg-[#0A1628] border-slate-600" /></div>
                  <div><Label className="text-slate-400">IdP Certificate</Label><textarea placeholder="-----BEGIN CERTIFICATE-----" className="mt-1 w-full h-24 rounded-md bg-[#0A1628] border border-slate-600 p-3 text-sm" /></div>
                  <Button className="bg-[#C9A84C] hover:bg-[#B8973B] text-[#0A1628]">Save Configuration</Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'playbooks' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Playbooks</h2>
                <Button className="bg-[#C9A84C] hover:bg-[#B8973B] text-[#0A1628]"><Plus className="h-4 w-4 mr-2" />Create Playbook</Button>
              </div>
              {[
                { name: 'Standard Commercial', matters: 45, rules: 24 },
                { name: 'M&A Transactions', matters: 12, rules: 32 },
                { name: 'Employment Agreements', matters: 28, rules: 18 },
              ].map((playbook, i) => (
                <Card key={i} className="bg-[#112240] border-slate-700 mb-4 cursor-pointer hover:border-[#C9A84C]/50">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div><h3 className="font-medium">{playbook.name}</h3><p className="text-sm text-slate-400">{playbook.matters} matters • {playbook.rules} rules</p></div>
                    <ChevronRight className="h-5 w-5 text-slate-500" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {activeTab === 'webhooks' && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Webhooks</h2>
                <Button className="bg-[#C9A84C] hover:bg-[#B8973B] text-[#0A1628]"><Plus className="h-4 w-4 mr-2" />Add Webhook</Button>
              </div>
              <Card className="bg-[#112240] border-slate-700">
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead><tr className="border-b border-slate-700"><th className="text-left p-4 text-sm text-slate-400">Endpoint</th><th className="text-left p-4 text-sm text-slate-400">Events</th><th className="text-left p-4 text-sm text-slate-400">Status</th></tr></thead>
                    <tbody>
                      <tr className="border-b border-slate-700/50"><td className="p-4"><code className="text-sm">https://api.slack.com/hooks/xxx</code></td><td className="p-4"><Badge variant="outline" className="border-slate-600 text-xs">flag.created</Badge></td><td className="p-4"><Badge className="bg-green-500/20 text-green-400">active</Badge></td></tr>
                      <tr><td className="p-4"><code className="text-sm">https://hooks.zapier.com/xxx</code></td><td className="p-4"><Badge variant="outline" className="border-slate-600 text-xs">document.processed</Badge></td><td className="p-4"><Badge className="bg-green-500/20 text-green-400">active</Badge></td></tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
