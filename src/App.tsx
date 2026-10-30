/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { useAuthStore } from './store/useAuthStore';
import { supabase } from './lib/supabase'; // Import Supabase thay vì Firebase

import Layout from './components/layout/Layout';
import Welcome from './pages/Welcome';
import Home from './pages/Home';
import Profile from './pages/Profile';
import AISearch from './pages/AISearch';
import CreatorDashboard from './pages/CreatorDashboard';
import Prompts from './pages/Prompts';
import Feedbacks from './pages/Feedbacks';
import Explore from './pages/Explore';
import Characters from './pages/Characters';
import Creators from './pages/Creators';
import Notifications from './pages/Notifications';
import Contact from './pages/Contact';
import Settings from './pages/Settings';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import AdminDashboard from './pages/AdminDashboard';
import DashboardStats from './pages/admin/DashboardStats';
import UserManagement from './pages/admin/UserManagement';
import ReportQueue from './pages/admin/ReportQueue';
import AuditLogs from './pages/admin/AuditLogs';
import BadgeManager from './pages/admin/BadgeManager';
import SupportManager from './pages/admin/SupportManager';
import AdminModeratorManager from './pages/admin/AdminModeratorManager';
import CreatorManager from './pages/admin/CreatorManager';
import AppealManagement from './pages/admin/AppealManagement';
import AdminSystemNotifications from './pages/admin/AdminSystemNotifications';
import CreatorDetail from './pages/CreatorDetail';
import CharacterDetail from './pages/CharacterDetail';
import PromptDetail from './pages/PromptDetail';
import { initThemeAndFont, applyTheme } from './lib/themeFont';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SuspendedAccountModal from './components/modals/SuspendedAccountModal';
import { UserInteractionsProvider } from './context/UserInteractionsContext';

function RootGate() {
  const { user, isInitialized } = useAuthStore();
  const [hasEntered, setHasEntered] = useState<boolean>(() => {
    return sessionStorage.getItem('has_entered_app') === 'true';
  });

  useEffect(() => {
    const handleEnteredChange = () => {
      setHasEntered(sessionStorage.getItem('has_entered_app') === 'true');
    };
    window.addEventListener('app-entered-changed', handleEnteredChange);
    return () => window.removeEventListener('app-entered-changed', handleEnteredChange);
  }, []);

  if (!isInitialized) return null;

  if (user || hasEntered) {
    return (
      <Layout>
        <Home />
      </Layout>
    );
  }

  return <Welcome onStart={() => setHasEntered(true)} />;
}

function UserRealtimeSync() {
  const { user, setAuth } = useAuthStore();

  useEffect(() => {
    if (!user?.id) return;

    const fetchAndSyncUser = async () => {
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error || !userData) return;

      const isDeleted = Boolean(userData.deletedAt || userData.status === 'DELETED');
      let isLocked = Boolean(userData.isLocked || isDeleted);

      if (userData.isLocked && !isDeleted) {
        const lockExpired = userData.lockExpiresAt && new Date(userData.lockExpiresAt).getTime() < Date.now();
        if (lockExpired) {
          await supabase.from('users').update({ isLocked: false, lockReason: null, lockExpiresAt: null, appealStatus: null }).eq('id', user.id);
          userData.isLocked = false;
          isLocked = false;
        }
      }

      const currentAuthStore = useAuthStore.getState();
      if (currentAuthStore.user) {
        setAuth(currentAuthStore.firebaseUser, {
          ...currentAuthStore.user,
          ...userData,
          isLocked: isLocked,
          status: isDeleted ? 'DELETED' : (userData.status || 'ACTIVE'),
          lockReason: userData.lockReason || userData.deleteReason || (isDeleted ? 'Tài khoản đã bị xóa/vô hiệu hóa bởi Quản trị viên.' : null),
          id: user.id
        });
      }
    };

    fetchAndSyncUser();

    // Thiết lập lắng nghe Realtime từ Supabase
    const channel = supabase
      .channel(`public:users:id=eq.${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${user.id}` },
        () => { fetchAndSyncUser(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return null;
}

export default function App() {
  const { setAuth, setInitialized } = useAuthStore();

  useEffect(() => {
    initThemeAndFont();

    const handleSessionSync = async (parsed: any) => {
      if (parsed && parsed.id) {
        const { data: userData } = await supabase.from('users').select('*').eq('id', parsed.id).single();
        
        if (userData) {
          const isDeleted = Boolean(userData.deletedAt || userData.status === 'DELETED');
          if (isDeleted) {
            userData.isLocked = true;
            userData.status = 'DELETED';
            if (!userData.lockReason && userData.deleteReason) {
              userData.lockReason = userData.deleteReason;
            }
          }

          if (userData.isLocked && !isDeleted && userData.lockExpiresAt && new Date(userData.lockExpiresAt).getTime() < Date.now()) {
            await supabase.from('users').update({ isLocked: false, lockReason: null, lockExpiresAt: null, appealStatus: null }).eq('id', parsed.id);
            userData.isLocked = false;
          }

          if (userData.isLocked || isDeleted) {
            try {
              const { data: appealDocs } = await supabase
                .from('appeals')
                .select('*')
                .eq('userId', parsed.id)
                .eq('targetType', 'ACCOUNT')
                .order('createdAt', { ascending: false })
                .limit(1);
                
              if (appealDocs && appealDocs.length > 0) {
                const latestAppeal = appealDocs[0];
                if (latestAppeal.status === 'APPROVED') {
                  await supabase.from('users').update({ 
                    isLocked: false, status: 'ACTIVE', deletedAt: null, deletedBy: null, deletedByName: null,
                    deleteReason: null, lockReason: null, lockExpiresAt: null, appealStatus: 'APPROVED' 
                  }).eq('id', parsed.id);
                  userData.isLocked = false;
                  userData.status = 'ACTIVE';
                  userData.deletedAt = null;
                  userData.deleteReason = null;
                  userData.appealStatus = 'APPROVED';
                } else {
                  userData.appealStatus = latestAppeal.status || 'PENDING';
                }
              } else {
                userData.appealStatus = 'NONE';
              }
            } catch (appealErr) {
              console.warn("Lỗi kiểm tra kháng cáo Supabase:", appealErr);
            }
          }

          const simulatedUser: any = {
            uid: parsed.id,
            email: userData.email,
            displayName: userData.displayName,
            photoURL: userData.avatar
          };
          
          if (userData.themePreference) applyTheme(userData.themePreference);
          setAuth(simulatedUser, { id: parsed.id, ...userData });
        } else {
          setAuth({ uid: parsed.id, email: parsed.email, displayName: parsed.displayName, photoURL: parsed.avatar } as any, parsed);
        }
      } else {
        setAuth(null, null);
      }
      setInitialized(true);
    };

    // Kiểm tra phiên đăng nhập hiện tại từ Supabase hoặc LocalStorage
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        await handleSessionSync({ id: session.user.id, email: session.user.email, displayName: session.user.user_metadata?.full_name, avatar: session.user.user_metadata?.avatar_url });
      } else {
        const customSession = localStorage.getItem('custom_auth_user');
        if (customSession) {
          try {
            await handleSessionSync(JSON.parse(customSession));
          } catch (err) {
            setAuth(null, null);
            setInitialized(true);
          }
        } else {
          setAuth(null, null);
          setInitialized(true);
        }
      }
    };

    checkAuth();

    // Lắng nghe thay đổi trạng thái đăng nhập từ Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await handleSessionSync({ id: session.user.id, email: session.user.email, displayName: session.user.user_metadata?.full_name, avatar: session.user.user_metadata?.avatar_url });
      } else if (!localStorage.getItem('custom_auth_user')) {
        setAuth(null, null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <UserInteractionsProvider>
      <BrowserRouter>
        <UserRealtimeSync />
        <SuspendedAccountModal />
        <Toaster position="top-center" />
        <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/" element={<RootGate />} />
        
        <Route element={<Layout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/characters" element={<Characters />} />
          <Route path="/creators" element={<Creators />} />
          <Route path="/ai-search" element={<AISearch />} />
          <Route path="/prompts" element={<Prompts />} />
          <Route path="/feedbacks" element={<Feedbacks />} />
          <Route path="/feedback" element={<Feedbacks />} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/creator/dashboard" element={<ProtectedRoute><CreatorDashboard /></ProtectedRoute>} />
          <Route path="/creator/:id" element={<CreatorDetail />} />
          <Route path="/user/:id" element={<CreatorDetail />} />
          <Route path="/character/:id" element={<CharacterDetail />} />
          <Route path="/prompt/:id" element={<PromptDetail />} />
          <Route path="/admin" element={<ProtectedRoute><DashboardStats /></ProtectedRoute>} />
          <Route path="/admin/dashboard" element={<ProtectedRoute><DashboardStats /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute><ReportQueue /></ProtectedRoute>} />
          <Route path="/admin/appeals" element={<ProtectedRoute><AppealManagement /></ProtectedRoute>} />
          <Route path="/admin/audit" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
          <Route path="/admin/badges" element={<ProtectedRoute><BadgeManager /></ProtectedRoute>} />
          <Route path="/admin/support" element={<ProtectedRoute><SupportManager /></ProtectedRoute>} />
          <Route path="/admin/system-notifications" element={<ProtectedRoute><AdminSystemNotifications /></ProtectedRoute>} />
          <Route path="/admin/managers" element={<ProtectedRoute><AdminModeratorManager /></ProtectedRoute>} />
          <Route path="/admin/creators" element={<ProtectedRoute><CreatorManager /></ProtectedRoute>} />
          <Route path="/admin/content" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
          <Route path="*" element={<div className="p-8 text-center">404 - Not Found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </UserInteractionsProvider>
  );
}
