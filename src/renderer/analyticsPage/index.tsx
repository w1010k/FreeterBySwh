/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

/**
 * Entry of the browser Analytics page, served by the main process's local
 * analytics server (see main/infra/analyticsServer). Runs in the user's default
 * browser, outside Electron: no MainApi, only same-origin fetches to that server.
 */

import { createRoot } from 'react-dom/client';
import { AnalyticsPage } from '@/analyticsPage/analyticsPage';

const root = document.getElementById('app');
if (root) {
  createRoot(root).render(<AnalyticsPage />);
}
