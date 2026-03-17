'use client';

import { useEffect } from 'react';

export default function EnsureGroupFolders() {
  useEffect(() => {
    fetch('/api/yandex/group-folders', { method: 'POST' }).catch(() => {});
  }, []);
  return null;
}
