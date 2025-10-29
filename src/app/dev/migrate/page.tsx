'use client';

import { useEffect, useState } from 'react';
import { migrateToBusinesses } from '@/scripts/migrate-to-businesses';

export default function MigratePage() {
  const [status, setStatus] = useState<'pending' | 'done' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    migrateToBusinesses()
      .then(() => {
        setStatus('done');
        setMessage('Migration finished. You can close this page.');
      })
      .catch((error) => {
        console.error(error);
        setStatus('error');
        setMessage('Migration failed – check the console for details.');
      });
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold mb-4">Run migration</h1>
      <p>{status === 'pending' ? 'Running…' : message}</p>
    </main>
  );
}