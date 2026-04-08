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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  Trash2,
  Edit,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
export type UserStatus = 'active' | 'pending' | 'suspended' | 'deleted';

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  lastActive?: string;
  invitedAt?: string;
  mfaEnabled: boolean;
}

interface UserManagementProps {
  members: TeamMember[];
  currentUserId: string;
  currentUserRole: UserRole;
  onInvite: (email: string, role: UserRole) => Promise<void>;
  onUpdateRole: (userId: string, role: UserRole) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  onResendInvite: (userId: string) => Promise<void>;
  onToggleSuspend: (userId: string) => Promise<void>;
}

export function UserManagement({
  members,
  currentUserId,
  currentUserRole,
  onInvite,
  onUpdateRole,
  onRemove,
  onResendInvite,
  onToggleSuspend,
}: UserManagementProps) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('member');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManageUsers = currentUserRole === 'owner' || currentUserRole === 'admin';
  const canInviteUsers = canManageUsers;

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setIsSubmitting(true);
    try {
      await onInvite(inviteEmail, inviteRole);
      setInviteEmail('');
      setInviteRole('member');
      setIsInviteOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: UserStatus) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'suspended':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const canEditUser = (member: TeamMember) => {
    if (member.id === currentUserId) return false;
    if (currentUserRole === 'owner') return true;
    if (currentUserRole === 'admin' && member.role !== 'owner') return true;
    return false;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              Manage your team&apos;s access and permissions
            </CardDescription>
          </div>
          {canInviteUsers && (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join your team
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer (Read-only)</SelectItem>
                        <SelectItem value="member">Member (Standard)</SelectItem>
                        <SelectItem value="admin">Admin (Full access)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleInvite} disabled={!inviteEmail || isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send Invitation'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>MFA</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">
                      {member.name || 'Pending'}
                      {member.id === currentUserId && (
                        <span className="text-muted-foreground ml-2">(You)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getRoleBadgeVariant(member.role)}>
                    {member.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(member.status)}
                    <span className="text-sm capitalize">{member.status}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {member.mfaEnabled ? (
                    <Shield className="h-4 w-4 text-green-500" />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {member.lastActive
                    ? new Date(member.lastActive).toLocaleDateString()
                    : member.invitedAt
                    ? `Invited ${new Date(member.invitedAt).toLocaleDateString()}`
                    : '—'}
                </TableCell>
                <TableCell>
                  {canEditUser(member) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.status === 'pending' && (
                          <DropdownMenuItem onClick={() => onResendInvite(member.id)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Resend Invitation
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem>
                          <Edit className="h-4 w-4 mr-2" />
                          Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onToggleSuspend(member.id)}>
                          {member.status === 'suspended' ? (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Reactivate
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-2" />
                              Suspend
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => onRemove(member.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default UserManagement;
