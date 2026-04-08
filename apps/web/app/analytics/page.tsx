'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart3, TrendingUp, FileText, AlertTriangle, CheckCircle, Clock, Users, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  const metrics = [
    { title: 'Total Documents', value: '2,847', change: 12.5, icon: <FileText className="h-5 w-5 text-[#C9A84C]" /> },
    { title: 'Active Matters', value: 156, change: 8.2, icon: <BarChart3 className="h-5 w-5 text-blue-400" /> },
    { title: 'Open Flags', value: 47, change: -15.3, icon: <AlertTriangle className="h-5 w-5 text-amber-400" /> },
    { title: 'Avg. Health Score', value: '78%', change: 5.1, icon: <CheckCircle className="h-5 w-5 text-green-400" /> },
  ];

  const flagsByCategory = [
    { category: 'Missing Clauses', count: 12, severity: 'high' },
    { category: 'Non-Compliant Terms', count: 18, severity: 'medium' },
    { category: 'Unusual Provisions', count: 8, severity: 'low' },
    { category: 'High Risk Exposure', count: 5, severity: 'critical' },
  ];

  const topMatters = [
    { name: 'Acme Corp Acquisition', health: 92, docs: 47, flags: 2 },
    { name: 'TechStart Series B', health: 85, docs: 23, flags: 5 },
    { name: 'Global Services RFP', health: 71, docs: 15, flags: 8 },
    { name: 'Patent Portfolio Review', health: 68, docs: 89, flags: 12 },
    { name: 'Employment Restructure', health: 45, docs: 34, flags: 18 },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-[#C9A84C]" />
              Firm Analytics
            </h1>
            <p className="text-slate-400 mt-2">Monitor your firm&apos;s document intelligence metrics</p>
          </div>
          <div className="flex gap-2 bg-[#112240] rounded-lg p-1">
            {(['7d', '30d', '90d', '1y'] as const).map((range) => (
              <button key={range} onClick={() => setTimeRange(range)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeRange === range ? 'bg-[#C9A84C] text-[#0A1628]' : 'text-slate-400 hover:text-white'}`}>
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : '1 Year'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {metrics.map((metric, i) => (
            <Card key={i} className="bg-[#112240] border-slate-700">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-400">{metric.title}</p>
                    <p className="text-3xl font-bold mt-1">{metric.value}</p>
                    <div className={`flex items-center gap-1 mt-2 text-sm ${metric.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {metric.change >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                      <span>{Math.abs(metric.change)}%</span>
                      <span className="text-slate-500">vs last period</span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#0A1628] rounded-lg">{metric.icon}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="bg-[#112240] border-slate-700 lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                Flags by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {flagsByCategory.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${item.severity === 'critical' ? 'bg-red-500' : item.severity === 'high' ? 'bg-orange-500' : item.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                      <span className="text-sm text-slate-300">{item.category}</span>
                    </div>
                    <Badge variant="outline" className="border-slate-600">{item.count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#112240] border-slate-700 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#C9A84C]" />
                Matter Health Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topMatters.map((matter, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{matter.name}</span>
                        <span className={`text-sm ${matter.health >= 80 ? 'text-green-400' : matter.health >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{matter.health}%</span>
                      </div>
                      <div className="h-2 bg-[#0A1628] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${matter.health >= 80 ? 'bg-green-500' : matter.health >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${matter.health}%` }} />
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-slate-500">
                        <span>{matter.docs} docs</span>
                        <span>{matter.flags} flags</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
