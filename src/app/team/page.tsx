'use client';

import { useEffect, useMemo, useState } from 'react';
import { ID, Query, type Models } from 'appwrite';
import { useRouter } from 'next/navigation';
import { account, databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite';
import { useBusinessContext } from '@/contexts/BusinessContext';
import { alertDemoReadOnly } from '@/config/demo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type BusinessUserDocument = Models.Document & {
  businessId?: string;
  userId?: string;
  role?: string;
  invitedBy?: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export default function TeamPage() {
  const router = useRouter();
  const {
    currentBusiness,
    currentMembership,
    userBusinesses,
    loading: businessLoading,
    refreshBusinesses,
    isDemoUser,
  } = useBusinessContext();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<BusinessUserDocument[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageTeam = useMemo(() => {
    if (isDemoUser) {
      return false;
    }
    if (!currentBusiness || !currentMembership) {
      return false;
    }

    const role = currentMembership.role ? String(currentMembership.role).toLowerCase() : '';
    return role === 'owner' || role === 'admin';
  }, [currentBusiness, currentMembership, isDemoUser]);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const user = await account.get();
        if (!isMounted) return;
        setCurrentUserId(user.$id);
      } catch {
        router.push('/login');
      }
    };

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const fetchMembers = async (businessId: string) => {
    setLoadingMembers(true);
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.BUSINESS_USERS,
        [
          Query.equal('businessId', businessId),
          Query.orderAsc('$createdAt'),
        ]
      );
      setMembers(response.documents as unknown as BusinessUserDocument[]);
    } catch (err) {
      console.error('Failed to load team members:', err);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (businessLoading) {
      return;
    }

    if (!currentBusiness) {
      if (userBusinesses.length === 0) {
        router.replace('/onboarding');
      }
      return;
    }

    fetchMembers(currentBusiness.$id);
  }, [businessLoading, currentBusiness, router, userBusinesses]);

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (isDemoUser) {
      alertDemoReadOnly();
      return;
    }

    if (!currentBusiness) {
      setError('No active business selected.');
      return;
    }

    if (!currentUserId) {
      setError('Unable to determine current user.');
      return;
    }

    const trimmedUserId = inviteUserId.trim();
    if (!trimmedUserId) {
      setError('User ID is required.');
      return;
    }

    setInviteLoading(true);
    try {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.BUSINESS_USERS,
        ID.unique(),
        {
          businessId: currentBusiness.$id,
          userId: trimmedUserId,
          role: inviteRole,
          invitedBy: currentUserId,
        }
      );

      await fetchMembers(currentBusiness.$id);
      await refreshBusinesses();
      setInviteUserId('');
      setInviteRole('editor');
    } catch (err) {
      console.error('Failed to add team member:', err);
      setError('Failed to add team member. Check the console for details.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (member: BusinessUserDocument) => {
    if (isDemoUser) {
      alertDemoReadOnly();
      return;
    }

    if (!currentBusiness) {
      return;
    }

    if (!canManageTeam) {
      setError('You do not have permission to manage the team.');
      return;
    }

    if (!member.$id || member.userId === currentUserId) {
      setError('You cannot remove yourself from the team.');
      return;
    }

    const confirmRemoval = window.confirm('Remove this member from the business?');
    if (!confirmRemoval) {
      return;
    }

    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.BUSINESS_USERS,
        member.$id
      );
      await fetchMembers(currentBusiness.$id);
      await refreshBusinesses();
    } catch (err) {
      console.error('Failed to remove team member:', err);
      setError('Failed to remove team member. Please try again.');
    }
  };

  if (businessLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Loading team...
      </div>
    );
  }

  if (!currentBusiness) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-lg font-semibold text-slate-700">No business selected.</p>
        <Button onClick={() => router.push('/onboarding?mode=create')}>
          {userBusinesses.length > 0 ? 'Create another business' : 'Create a business'}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-slate-900">Team</h1>
        <p className="text-sm text-slate-600">
          Manage who can access <span className="font-medium text-slate-900">{currentBusiness.name ?? 'this business'}</span>.
        </p>
      </div>

      {isDemoUser && (
        <div className="mb-6 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          Demo mode is read-only. You can preview the team workflow, but invites and removals are disabled.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {(canManageTeam || isDemoUser) && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Add a team member</CardTitle>
          </CardHeader>
          <CardContent>
            {!canManageTeam && isDemoUser && (
              <p className="mb-4 text-sm text-slate-500">
                This form is disabled because the shared demo account cannot change the workspace team.
              </p>
            )}
            <form onSubmit={handleInvite} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="invite-userId">Appwrite User ID</Label>
                <Input
                  id="invite-userId"
                  value={inviteUserId}
                  onChange={(event) => setInviteUserId(event.target.value)}
                  placeholder="userId"
                  required
                  disabled={inviteLoading || !canManageTeam}
                />
              </div>
              <div className="sm:w-48">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                  disabled={inviteLoading || !canManageTeam}
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div>
                <Button type="submit" disabled={inviteLoading || !canManageTeam}>
                  {inviteLoading ? 'Adding…' : 'Add Member'}
                </Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              Invite teammates by their Appwrite user ID. Owners can promote others to admin or remove members.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading team members…</div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              No team members yet. Use the form above to add people to this business.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const memberRole = member.role ? String(member.role).toLowerCase() : 'viewer';
                  const roleLabel = ROLE_LABELS[memberRole] ?? memberRole;
                  const invitedByLabel = member.invitedBy ?? '—';
                  const isSelf = member.userId === currentUserId;
                  const isOwner = memberRole === 'owner';
                  const canRemove = canManageTeam && !isOwner && !isSelf;

                  return (
                    <TableRow key={member.$id}>
                      <TableCell className="font-mono text-xs sm:text-sm">{member.userId ?? '—'}</TableCell>
                      <TableCell className="text-sm font-medium capitalize">{roleLabel}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{invitedByLabel}</TableCell>
                      <TableCell className="text-right">
                        {canRemove ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveMember(member)}
                          >
                            Remove
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {isSelf ? 'You' : isOwner ? 'Owner' : '—'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
