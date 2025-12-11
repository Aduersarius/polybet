'use client';

import { redirect } from 'next/navigation';

export default function AdminWithdrawPage() {
    redirect('/admin?view=withdraw');
}
