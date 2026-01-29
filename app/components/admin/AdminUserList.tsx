'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useQueryState, parseAsInteger, parseAsString, parseAsArrayOf } from 'nuqs';
import {
    ColumnDef,
} from '@tanstack/react-table';
import { Text, DollarSign, CheckCircle2, ShieldAlert, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

import { DataTable } from '@/components/data-table/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { useDataTable } from '@/hooks/use-data-table';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, ShieldCheck, ExternalLink } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { generateAvatarDataUri } from '@/lib/avatar';

interface AdminUser {
    id: string;
    address: string;
    username: string | null;
    email: string | null;
    name: string | null;
    image: string | null;
    avatarUrl: string | null;
    isBanned: boolean;
    isAdmin: boolean;
    isDeleted: boolean;
    lastIp?: string | null;
    lastCountry?: string | null;
    currentBalance?: number;
    totalDeposited?: number;
    totalWithdrawn?: number;
    winRate?: number;
    lastSeen?: string;
    _count: {
        marketActivity: number;
        createdEvents: number;
    };
    createdAt: string;
}

export function AdminUserList() {
    const adminId = 'dev-user'; // Mock admin ID
    const queryClient = useQueryClient();

    // URL State via Nuqs (handled by useDataTable)
    // We optionally listen to specific filters to pass to API
    const [search] = useQueryState('user', parseAsString.withDefault(''));
    const [statusFilter] = useQueryState('status', parseAsArrayOf(parseAsString).withDefault([]));

    const [page] = useQueryState('page', parseAsInteger.withDefault(1));
    const [perPage] = useQueryState('perPage', parseAsInteger.withDefault(10));
    const [sorting] = useQueryState('sort', {
        parse: (value) => {
            try {
                return JSON.parse(value);
            } catch {
                return null;
            }
        }, // Simple parser for now, useDataTable handles complex
        serialize: (value) => JSON.stringify(value),
    });

    const sortField = Array.isArray(sorting) && sorting[0]?.id ? sorting[0].id : 'createdAt';
    const sortDir = Array.isArray(sorting) && sorting[0]?.desc ? 'desc' : 'asc';

    // Data Fetching
    const { data: usersData, isLoading } = useQuery({
        queryKey: ['admin', 'users', adminId, page, perPage, search, statusFilter, sortField, sortDir],
        queryFn: async () => {
            const params = new URLSearchParams({
                adminId,
                page: page.toString(),
                limit: perPage.toString(),
                ...(search && { search }),
                ...(statusFilter.length > 0 && { status: statusFilter.join(',') }),
                sortField: sortField as string,
                sortDir: sortDir as string,
            });
            const res = await fetch(`/api/admin/users?${params}`);
            if (!res.ok) throw new Error('Failed to fetch users');
            return res.json() as Promise<{ users: AdminUser[]; total: number }>;
        },
    });

    const users = React.useMemo(() => usersData?.users || [], [usersData]);
    const totalUsers = usersData?.total || 0;
    const pageCount = Math.ceil(totalUsers / perPage);

    // Mutations
    const updateUserMutation = useMutation({
        mutationFn: async ({ targetUserId, action }: { targetUserId: string; action: string }) => {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId, targetUserId, action }),
            });
            if (!res.ok) throw new Error('Failed to update user');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            toast({ title: 'Success', description: 'User updated successfully' });
        },
        onError: () => {
            toast({ title: 'Error', description: 'Failed to update user', variant: 'destructive' });
        }
    });

    const deleteUserMutation = useMutation({
        mutationFn: async (targetUserId: string) => {
            const res = await fetch('/api/admin/users', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId, targetUserId }),
            });
            if (!res.ok) throw new Error('Failed to delete user');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            toast({ title: 'Success', description: 'User deleted successfully' });
        },
        onError: () => {
            toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' });
        }
    });

    // Column Definitions
    const columns = React.useMemo<ColumnDef<AdminUser>[]>(() => [
        {
            id: 'select',
            header: ({ table }) => (
                <Checkbox
                    checked={
                        table.getIsAllPageRowsSelected() ||
                        (table.getIsSomePageRowsSelected() && 'indeterminate')
                    }
                    onCheckedChange={(value: any) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                    className="translate-y-[2px]"
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value: any) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                    className="translate-y-[2px]"
                />
            ),
            size: 32,
            enableSorting: false,
            enableHiding: false,
        },
        {
            id: 'user',
            accessorFn: (row) => row.name || row.username || row.address,
            header: ({ column }) => <DataTableColumnHeader column={column} label="User" />,
            cell: ({ row }) => {
                const user = row.original;
                return (
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-zinc-800">
                            <AvatarImage src={user.avatarUrl || user.image || generateAvatarDataUri(user.username || user.address || user.id, 40)} />
                            <AvatarFallback>{(user.username?.[0] || 'U').toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">{user.name || user.username || 'Unknown'}</span>
                            <span className="text-xs text-zinc-500 font-mono">
                                {user.address ? `${user.address.slice(0, 6)}...${user.address.slice(-4)}` : '—'}
                            </span>
                        </div>
                    </div>
                );
            },
            meta: {
                label: 'User',
                placeholder: 'Search user...',
                variant: 'text',
                icon: Text
            },
            enableColumnFilter: true,
        },
        {
            id: 'email',
            accessorKey: 'email',
            header: ({ column }) => <DataTableColumnHeader column={column} label="Email" />,
            cell: ({ getValue }) => <span className="text-sm text-zinc-400">{(getValue() as string) || '—'}</span>,
            enableColumnFilter: false, // Disabled to simplify toolbar, using 'User' search for everything
        },
        {
            id: 'currentBalance',
            accessorKey: 'currentBalance',
            header: ({ column }) => <DataTableColumnHeader column={column} label="Balance" />,
            cell: ({ getValue }) => {
                const amount = getValue() as number;
                return (
                    <div className="flex items-center gap-1 font-mono text-xs">
                        <DollarSign className="w-3 h-3 text-emerald-500" />
                        <span>{amount?.toFixed(2) || '0.00'}</span>
                    </div>
                );
            },
            enableColumnFilter: false,
        },
        {
            id: 'totalDeposited',
            accessorKey: 'totalDeposited',
            header: ({ column }) => <DataTableColumnHeader column={column} label="Deposited" />,
            cell: ({ getValue }) => {
                const amount = getValue() as number;
                return (
                    <div className="flex items-center gap-1 font-mono text-xs text-zinc-400">
                        <DollarSign className="w-3 h-3 text-zinc-500" />
                        <span>{amount?.toFixed(2) || '0.00'}</span>
                    </div>
                );
            },
            enableColumnFilter: false,
        },
        {
            id: 'totalWithdrawn',
            accessorKey: 'totalWithdrawn',
            header: ({ column }) => <DataTableColumnHeader column={column} label="Withdrawn" />,
            cell: ({ getValue }) => {
                const amount = getValue() as number;
                return (
                    <div className="flex items-center gap-1 font-mono text-xs text-zinc-400">
                        <DollarSign className="w-3 h-3 text-zinc-500" />
                        <span>{amount?.toFixed(2) || '0.00'}</span>
                    </div>
                );
            },
            enableColumnFilter: false,
        },
        {
            id: 'winRate',
            accessorKey: 'winRate',
            header: ({ column }) => <DataTableColumnHeader column={column} label="Win Rate" />,
            cell: ({ getValue }) => {
                const rate = getValue() as number;
                if (rate === undefined || rate === null) return <span className="text-xs text-zinc-500">—</span>;
                const percentage = Math.round(rate * 100);
                const colorClass = percentage >= 50 ? 'text-emerald-500' : 'text-red-500';
                return (
                    <div className={`font-mono text-xs font-medium ${colorClass}`}>
                        {percentage}%
                    </div>
                );
            },
            enableColumnFilter: false,
        },
        {
            id: 'lastSeen',
            accessorKey: 'lastSeen',
            header: ({ column }) => <DataTableColumnHeader column={column} label="Last Seen" />,
            cell: ({ getValue }) => {
                const dateStr = getValue() as string;
                if (!dateStr) return <span className="text-xs text-zinc-500">—</span>;
                return (
                    <span className="text-xs text-zinc-500">
                        {format(new Date(dateStr), 'MMM d, HH:mm')}
                    </span>
                );
            },
            enableColumnFilter: false,
        },
        {
            id: 'marketActivity',
            accessorFn: (row) => row._count.marketActivity,
            header: ({ column }) => <DataTableColumnHeader column={column} label="Bets" />,
            cell: ({ row }) => (
                <Badge variant="outline" className="text-[11px] h-5 border-blue-500/20 bg-blue-500/10 text-blue-200 px-2.5">
                    {row.original._count.marketActivity}
                </Badge>
            ),
            enableColumnFilter: false,
        },
        {
            id: 'status',
            accessorFn: (row) => {
                if (row.isDeleted) return 'deleted';
                if (row.isBanned) return 'banned';
                if (row.isAdmin) return 'admin';
                return 'active';
            },
            header: ({ column }) => <DataTableColumnHeader column={column} label="Status" />,
            cell: ({ row }) => {
                const user = row.original;
                return (
                    <div className="flex gap-1">
                        {user.isAdmin && <Badge variant="outline" className="border-purple-500/50 text-purple-400 bg-purple-500/10 text-[10px]"><ShieldCheck className="w-3 h-3 mr-1" />Admin</Badge>}
                        {user.isDeleted && <Badge variant="destructive" className="text-[10px]"><Trash2 className="w-3 h-3 mr-1" />Deleted</Badge>}
                        {user.isBanned && <Badge variant="destructive" className="text-[10px]"><ShieldAlert className="w-3 h-3 mr-1" />Banned</Badge>}
                        {!user.isBanned && !user.isDeleted && !user.isAdmin && <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 bg-emerald-500/10 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>}
                    </div>
                );
            },
            meta: {
                label: 'Status',
                variant: 'multiSelect',
                options: [
                    { label: 'Active', value: 'active', icon: CheckCircle2 },
                    { label: 'Banned', value: 'banned', icon: ShieldAlert },
                    { label: 'Admin', value: 'admin', icon: ShieldCheck },
                    { label: 'Deleted', value: 'deleted', icon: Trash2 },
                ]
            },
            enableColumnFilter: true,
        },
        {
            id: 'lastCountry',
            accessorKey: 'lastCountry',
            header: ({ column }) => <DataTableColumnHeader column={column} label="Country" />,
            cell: ({ getValue }) => (
                <div className="flex items-center gap-2">
                    <span className="text-sm">{(getValue() as string) === 'US' ? '🇺🇸' : '🌐'}</span>
                    <span className="text-xs text-zinc-500">{(getValue() as string) || 'N/A'}</span>
                </div>
            ),
            enableColumnFilter: false,
        },
        {
            id: 'createdAt',
            accessorKey: 'createdAt',
            header: ({ column }) => <DataTableColumnHeader column={column} label="Joined" />,
            cell: ({ getValue }) => (
                <span className="text-xs text-zinc-500">
                    {format(new Date(getValue() as string), 'MMM d, yyyy')}
                </span>
            ),
            enableColumnFilter: false,
        },
        {
            id: 'actions',
            cell: ({ row }) => {
                const user = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(user.id)}>
                                Copy ID
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(`/admin/users/${user.id}`, '_blank')}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Profile
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => updateUserMutation.mutate({ targetUserId: user.id, action: user.isBanned ? 'unban' : 'ban' })}
                            >
                                {user.isBanned ? <ShieldCheck className="mr-2 h-4 w-4 text-green-500" /> : <ShieldAlert className="mr-2 h-4 w-4 text-orange-500" />}
                                {user.isBanned ? 'Unban User' : 'Ban User'}
                            </DropdownMenuItem>
                            {!user.isDeleted && (
                                <DropdownMenuItem
                                    className="text-red-500 focus:text-red-500"
                                    onClick={() => deleteUserMutation.mutate(user.id)}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete User
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
    ], [updateUserMutation, deleteUserMutation]);

    const { table } = useDataTable({
        data: users,
        columns,
        pageCount,
        initialState: {
            pagination: { pageIndex: 0, pageSize: 10 },
            sorting: [{ id: 'createdAt', desc: true }],
            columnVisibility: {
                email: false,
                lastCountry: false,
            }
        },
    });


    return (
        <div className="h-full flex-1 flex-col space-y-8 p-8 md:flex">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground/80 to-muted-foreground bg-clip-text text-transparent">User Management</h2>
                    <p className="text-muted-foreground">
                        Real-time monitoring of system participants and financial integrity.
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="border-border bg-muted text-muted-foreground py-1.5 px-4 rounded-full">
                        <span className="text-foreground mr-2 uppercase tracking-wider text-[10px] font-bold">Total Users</span> {totalUsers}
                    </Badge>
                </div>
            </div>
            <DataTable table={table}>
                <DataTableToolbar table={table} />
            </DataTable>
        </div>
    );
}
