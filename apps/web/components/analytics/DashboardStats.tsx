'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  FileText,
  AlertTriangle,
  Users,
  Clock,
  Sparkles,
} from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  description?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeLabel = 'vs last period',
  icon,
  description,
}: StatCardProps) {
  const isPositive = change && change >= 0;
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className="flex items-center gap-1 mt-1">
            {isPositive ? (
              <TrendingUp className="h-3 w-3 text-green-500" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-500" />
            )}
            <span
              className={`text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}
            >
              {isPositive ? '+' : ''}{change}% {changeLabel}
            </span>
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export interface DashboardStatsProps {
  documentsProcessed: number;
  documentsTrend?: number;
  activeMatters: number;
  mattersTrend?: number;
  flagsIdentified: number;
  flagsTrend?: number;
  aiQueriesUsed: number;
  aiQueriesTrend?: number;
  avgProcessingTime?: number; // seconds
  teamMembers?: number;
}

export function DashboardStats({
  documentsProcessed,
  documentsTrend,
  activeMatters,
  mattersTrend,
  flagsIdentified,
  flagsTrend,
  aiQueriesUsed,
  aiQueriesTrend,
  avgProcessingTime,
  teamMembers,
}: DashboardStatsProps) {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Documents Processed"
        value={documentsProcessed.toLocaleString()}
        change={documentsTrend}
        icon={<FileText className="h-4 w-4" />}
      />
      <StatCard
        title="Active Matters"
        value={activeMatters.toLocaleString()}
        change={mattersTrend}
        icon={<BarChart3 className="h-4 w-4" />}
      />
      <StatCard
        title="Flags Identified"
        value={flagsIdentified.toLocaleString()}
        change={flagsTrend}
        icon={<AlertTriangle className="h-4 w-4" />}
        description="Across all matters"
      />
      <StatCard
        title="AI Queries Used"
        value={aiQueriesUsed.toLocaleString()}
        change={aiQueriesTrend}
        icon={<Sparkles className="h-4 w-4" />}
      />
      {avgProcessingTime !== undefined && (
        <StatCard
          title="Avg Processing Time"
          value={formatTime(avgProcessingTime)}
          icon={<Clock className="h-4 w-4" />}
          description="Per document"
        />
      )}
      {teamMembers !== undefined && (
        <StatCard
          title="Team Members"
          value={teamMembers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
      )}
    </div>
  );
}

export interface RiskDistributionProps {
  high: number;
  medium: number;
  low: number;
  info?: number;
}

export function RiskDistributionChart({ high, medium, low, info = 0 }: RiskDistributionProps) {
  const total = high + medium + low + info;
  
  const getWidth = (count: number) => {
    if (total === 0) return '0%';
    return `${(count / total) * 100}%`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Risk Distribution</CardTitle>
        <CardDescription>Breakdown of identified risks</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No risks identified yet
          </p>
        ) : (
          <>
            {/* Stacked bar */}
            <div className="h-4 rounded-full overflow-hidden flex mb-4">
              {high > 0 && (
                <div
                  className="bg-red-500 transition-all"
                  style={{ width: getWidth(high) }}
                />
              )}
              {medium > 0 && (
                <div
                  className="bg-yellow-500 transition-all"
                  style={{ width: getWidth(medium) }}
                />
              )}
              {low > 0 && (
                <div
                  className="bg-green-500 transition-all"
                  style={{ width: getWidth(low) }}
                />
              )}
              {info > 0 && (
                <div
                  className="bg-blue-500 transition-all"
                  style={{ width: getWidth(info) }}
                />
              )}
            </div>
            
            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-red-500" />
                <span>High: {high}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-yellow-500" />
                <span>Medium: {medium}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500" />
                <span>Low: {low}</span>
              </div>
              {info > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-blue-500" />
                  <span>Info: {info}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export interface ActivityItem {
  id: string;
  type: 'document' | 'matter' | 'user' | 'ai' | 'system';
  action: string;
  description: string;
  timestamp: string;
  user?: string;
}

export interface RecentActivityProps {
  activities: ActivityItem[];
  maxItems?: number;
}

export function RecentActivity({ activities, maxItems = 10 }: RecentActivityProps) {
  const displayedActivities = activities.slice(0, maxItems);

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'document':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'matter':
        return <BarChart3 className="h-4 w-4 text-purple-500" />;
      case 'user':
        return <Users className="h-4 w-4 text-green-500" />;
      case 'ai':
        return <Sparkles className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>Latest actions in your workspace</CardDescription>
      </CardHeader>
      <CardContent>
        {displayedActivities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent activity
          </p>
        ) : (
          <div className="space-y-4">
            {displayedActivities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3">
                <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.action}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {activity.description}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(activity.timestamp)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DashboardStats;
