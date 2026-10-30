import React, { useState, useEffect } from 'react';
import { 
  Bell, UserPlus, MessageSquare, Heart, Bookmark, CheckCheck, Trash2, Filter, Sparkles, RefreshCw, MessageCircle,
  Shield, Check, X, HelpCircle, ShieldCheck, Megaphone
} from 'lucide-react';
// Xóa Firebase, thay bằng Supabase
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getValidAvatar } from '../lib/avatar';
import DeletedContentModal from '../components/DeletedContentModal';
import RemovalDetailModal from '../components/modals/RemovalDetailModal';
import SupportReplyModal from '../components/modals/SupportReplyModal';
import SystemNotificationModal from '../components/modals/SystemNotificationModal';

export interface NotificationItem {
  id: string;
  userId?: string;
  recipientId?: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  type: 'FOLLOW' | 'FEEDBACK' | 'COMMENT' | 'CHARACTER_LIKE' | 'CHARACTER_SAVE' | 'PROMPT_SAVE' | 'SYSTEM' | 'SYSTEM_BROADCAST' | string;
  title: string;
  message?: string;
  body?: string;
  content?: string;
  markdownContent?: string;
  isSystem?: boolean;
  isSystemBroadcast?: boolean;
  link?: string;
  targetId?: string;
  targetType?: string;
  read: boolean;
  createdAt: any;
  [key: string]: any;
}

export type NotificationCategory = 'ALL' | 'SYSTEM' | 'FOLLOW' | 'FEEDBACK' | 'COMMENT' | 'SAVE_LIKE';

export default function Notifications() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategory>('ALL');
  const [readFilter, setReadFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [isDeletedModalOpen, setIsDeletedModalOpen] = useState(false);
  const [deletedType, setDeletedType] = useState<string>('');
  const [checkingContent, setCheckingContent] = useState(false);

  const [removalModalData, setRemovalModalData] = useState<{
    isOpen: boolean;
    targetType: string;
    targetId: string;
    targetName?: string;
    removalReason?: string;
    removalDetails?: string;
    removalTime?: string;
  }>({
    isOpen: false,
    targetType: 'CHARACTER',
    targetId: ''
  });

  const [supportModalData, setSupportModalData] = useState<{
    isOpen: boolean;
    notification: NotificationItem | null;
  }>({
    isOpen: false,
    notification: null
  });

  const [systemModalData, setSystemModalData] = useState<{
    isOpen: boolean;
    notification: NotificationItem | null;
  }>({
    isOpen: false,
    notification: null
  });

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Fetch theo recipientId (Người nhận đích danh)
      const { data: recipientData } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipientId', user.id)
        .order('createdAt', { ascending: false })
        .limit(40);

      // 2. Fetch theo userId (Định dạng cũ)
      const { data: userData } = await supabase
        .from('notifications')
        .select('*')
        .eq('userId', user.id)
        .order('createdAt', { ascending: false })
        .limit(40);

      // 3. Fetch theo Broadcast (Thông báo toàn hệ thống)
      const { data: broadcastData } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipientId', 'ALL')
        .order('createdAt', { ascending: false })
        .limit(20);

      const map = new Map<string, NotificationItem>();

      const parseDoc = (d: any) => {
        const isBroadcast = d.recipientId === 'ALL' || d.isSystemBroadcast === true;
        const isRead = isBroadcast 
          ? (Array.isArray(d.readBy) && d.readBy.includes(user.id))
          : (d.read !== undefined ? d.read : (d.isRead !== undefined ? d.isRead : false));

        return {
          id: d.id,
          ...d,
          message: d.message || d.body || d.content || d.markdownContent || '',
          read: isRead
        } as NotificationItem;
      };

      if (recipientData) recipientData.forEach(d => map.set(d.id, parseDoc(d)));
      if (userData) userData.forEach(d => map.set(d.id, parseDoc(d)));
      if (broadcastData) broadcastData.forEach(d => map.set(d.id, parseDoc(d)));

      const list = Array.from(map.values()).sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      setNotifications(list);
    } catch (err) {
      console.error("Lỗi khi tải thông báo:", err);
      toast.error("Không thể tải thông báo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user?.id]);

  // Đánh dấu 1 thông báo là đã đọc
  const handleMarkAsRead = async (notifId: string) => {
    if (!user) return;
    try {
      const notif = notifications.find(n => n.id === notifId);

      if (notif && (notif.recipientId === 'ALL' || notif.isSystemBroadcast)) {
        const currentReadBy = Array.isArray(notif.readBy) ? notif.readBy : [];
        if (!currentReadBy.includes(user.id)) {
          const newReadBy = [...currentReadBy, user.id];
          await supabase.from('notifications').update({ readBy: newReadBy }).eq('id', notifId);
        }
      } else {
        await supabase.from('notifications').update({ read: true, isRead: true }).eq('id', notifId);
      }

      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n));
    } catch (err) {
      console.error("Mark as read error:", err);
    }
  };

  // Đánh dấu tất cả là đã đọc
  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;

    try {
      for (const n of unread) {
        if (n.recipientId === 'ALL' || n.isSystemBroadcast) {
          const currentReadBy = Array.isArray(n.readBy) ? n.readBy : [];
          if (!currentReadBy.includes(user.id)) {
            const newReadBy = [...currentReadBy, user.id];
            await supabase.from('notifications').update({ readBy: newReadBy }).eq('id', n.id);
          }
        } else {
          await supabase.from('notifications').update({ read: true, isRead: true }).eq('id', n.id);
        }
      }

      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success("Đã đánh dấu tất cả thông báo là đã đọc!");
    } catch (err) {
      console.error("Mark all as read error:", err);
      toast.error("Không thể cập nhật trạng thái.");
    }
  };

  // Xóa thông báo
  const handleDeleteNotif = async (notifId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase.from('notifications').delete().eq('id', notifId);
      setNotifications(prev => prev.filter(n => n.id !== notifId));
      toast.success("Đã xóa thông báo.");
    } catch (err) {
      console.error("Delete notification error:", err);
      toast.error("Không thể xóa thông báo.");
    }
  };

  const handleAcceptInvite = async (notif: NotificationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const timestamp = new Date().toISOString();

      await supabase.from('users').update({
        role: 'MODERATOR',
        permissions: ['MANAGE_REPORTS', 'MANAGE_CONTENT', 'MANAGE_USERS'],
        moderatorInviteStatus: 'ACCEPTED',
        updatedAt: timestamp
      }).eq('id', user.id);

      await supabase.from('notifications').update({
        read: true,
        inviteStatus: 'ACCEPTED',
        message: 'Bạn đã chấp nhận lời mời trở thành Moderator của hệ thống.'
      }).eq('id', notif.id);

      try {
        const { data: adminUsers } = await supabase.from('users').select('id').eq('role', 'ADMIN');
        if (adminUsers) {
          for (const admin of adminUsers) {
            await supabase.from('notifications').insert({
              userId: admin.id,
              recipientId: admin.id,
              type: 'MODERATOR_RESPONSE',
              title: 'Thành viên chấp nhận lời mời Moderator',
              message: `Thành viên ${user.displayName || ('Thành viên #' + (user.numericId || user.id.substring(0, 6)))} đã CHẤP NHẬN lời mời trở thành Moderator của hệ thống.`,
              read: false,
              createdAt: timestamp
            });
          }
        }
      } catch (adminErr) {
        console.error("Error notifying admins:", adminErr);
      }

      const { setAuth } = useAuthStore.getState();
      const updatedUser = { 
        ...user, 
        role: 'MODERATOR', 
        permissions: ['MANAGE_REPORTS', 'MANAGE_CONTENT', 'MANAGE_USERS'],
        moderatorInviteStatus: 'ACCEPTED' 
      };
      setAuth(useAuthStore.getState().firebaseUser, updatedUser);

      toast.success("Chấp nhận lời mời thành công! Bạn đã trở thành Moderator.");
      fetchNotifications();
    } catch (err) {
      console.error("Accept invite error:", err);
      toast.error("Lỗi khi đồng ý.");
    }
  };

  const handleRejectInvite = async (notif: NotificationItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const timestamp = new Date().toISOString();

      await supabase.from('users').update({
        moderatorInviteStatus: 'REJECTED',
        updatedAt: timestamp
      }).eq('id', user.id);

      await supabase.from('notifications').update({
        read: true,
        inviteStatus: 'REJECTED',
        message: 'Bạn đã từ chối lời mời trở thành Moderator của hệ thống.'
      }).eq('id', notif.id);

      try {
        const { data: adminUsers } = await supabase.from('users').select('id').eq('role', 'ADMIN');
        if (adminUsers) {
          for (const admin of adminUsers) {
            await supabase.from('notifications').insert({
              userId: admin.id,
              recipientId: admin.id,
              type: 'MODERATOR_RESPONSE',
              title: 'Thành viên từ chối lời mời Moderator',
              message: `Thành viên ${user.displayName || ('Thành viên #' + (user.numericId || user.id.substring(0, 6)))} đã TỪ CHỐI lời mời trở thành Moderator của hệ thống.`,
              read: false,
              createdAt: timestamp
            });
          }
        }
      } catch (adminErr) {
        console.error("Error notifying admins:", adminErr);
      }

      const { setAuth } = useAuthStore.getState();
      const updatedUser = { 
        ...user, 
        moderatorInviteStatus: 'REJECTED' 
      };
      setAuth(useAuthStore.getState().firebaseUser, updatedUser);

      toast.success("Từ chối lời mời thành công.");
      fetchNotifications();
    } catch (err) {
      console.error("Reject invite error:", err);
      toast.error("Lỗi khi từ chối.");
    }
  };

  const handleNotificationAction = async (notif: NotificationItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }

    if (notif.isSystem || notif.type === 'SYSTEM' || notif.type === 'SYSTEM_BROADCAST' || notif.markdownContent) {
      setSystemModalData({ isOpen: true, notification: notif });
      return;
    }

    if (notif.type === 'SUPPORT_REPLY' || notif.targetType === 'SUPPORT_TICKET') {
      setSupportModalData({ isOpen: true, notification: notif });
      return;
    }

    if (!notif.link) return;

    if (['FEEDBACK', 'COMMENT'].includes(notif.type) || ['FEEDBACK', 'COMMENT'].includes(notif.targetType || '')) {
      setCheckingContent(true);
      try {
        let exists = true;
        
        if (notif.targetId && notif.targetType) {
          const collectionMap: Record<string, string> = {
            'CHARACTER': 'characters',
            'PROMPT': 'prompts',
            'FEEDBACK': 'feedbacks',
            'COMMENT': 'comments'
          };
          
          const collectionName = collectionMap[notif.targetType] || (notif.type === 'FEEDBACK' ? 'feedbacks' : 'comments');

          const { data } = await supabase.from(collectionName).select('id, deletedAt').eq('id', notif.targetId).single();
          
          if (!data || data.deletedAt) {
            exists = false;
          }
        } 

        if (!exists) {
          setDeletedType(notif.targetType || (notif.type === 'FEEDBACK' ? 'FEEDBACK' : 'COMMENT'));
          setIsDeletedModalOpen(true);
          return;
        }
      } catch (err) {
        console.error("Error checking content existence:", err);
      } finally {
        setCheckingContent(false);
      }
    }

    navigate(notif.link);
  };

  const filteredNotifications = notifications.filter(n => {
    let matchesCategory = true;
    if (categoryFilter === 'SYSTEM') {
      matchesCategory = n.isSystem === true || n.type === 'SYSTEM' || n.type === 'SYSTEM_BROADCAST' || n.isSystemBroadcast === true || ['MODERATOR_INVITE', 'SUPPORT_REPLY', 'CONTENT_REMOVED', 'ACCOUNT_LOCKED', 'APPEAL_APPROVED', 'APPEAL_REJECTED'].includes(n.type);
    } else if (categoryFilter === 'FOLLOW') {
      matchesCategory = n.type === 'FOLLOW';
    } else if (categoryFilter === 'FEEDBACK') {
      matchesCategory = n.type === 'FEEDBACK';
    } else if (categoryFilter === 'COMMENT') {
      matchesCategory = n.type === 'COMMENT';
    } else if (categoryFilter === 'SAVE_LIKE') {
      matchesCategory = ['CHARACTER_LIKE', 'CHARACTER_SAVE', 'PROMPT_SAVE', 'LIKE', 'BOOKMARK', 'SAVE'].includes(n.type);
    }

    let matchesRead = true;
    if (readFilter === 'UNREAD') matchesRead = !n.read;
    if (readFilter === 'READ') matchesRead = n.read;

    return matchesCategory && matchesRead;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIconForType = (type: string) => {
    switch (type) {
      case 'SYSTEM':
      case 'SYSTEM_BROADCAST':
        return <ShieldCheck className="w-5 h-5 text-amber-500" />;
      case 'FOLLOW':
        return <UserPlus className="w-5 h-5 text-blue-500" />;
      case 'FEEDBACK':
        return <MessageSquare className="w-5 h-5 text-indigo-500" />;
      case 'COMMENT':
        return <MessageCircle className="w-5 h-5 text-emerald-500" />;
      case 'CHARACTER_LIKE':
      case 'LIKE':
        return <Heart className="w-5 h-5 text-red-500 fill-current" />;
      case 'CHARACTER_SAVE':
      case 'PROMPT_SAVE':
      case 'BOOKMARK':
      case 'SAVE':
        return <Bookmark className="w-5 h-5 text-amber-500 fill-current" />;
      case 'MODERATOR_INVITE':
        return <Shield className="w-5 h-5 text-purple-500" />;
      case 'SUPPORT_REPLY':
        return <HelpCircle className="w-5 h-5 text-amber-500" />;
      default:
        return <Bell className="w-5 h-5 text-neutral-500" />;
    }
  };

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <Bell className="w-16 h-16 text-neutral-400 mx-auto opacity-40" />
        <h2 className="text-2xl font-bold">Vui lòng đăng nhập</h2>
        <p className="text-neutral-500 text-sm">Bạn cần đăng nhập bằng tài khoản Google để xem thông báo cá nhân.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-black text-white p-6 md:p-8 rounded-3xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-neutral-800">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-800 text-neutral-300 rounded-full text-xs font-bold border border-neutral-700">
            <Bell className="w-3.5 h-3.5" />
            <span>Trung Tâm Thông Báo</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-3">
            Thông Báo
            {unreadCount > 0 && (
              <span className="text-xs bg-red-500 text-white font-black px-2.5 py-1 rounded-full">
                {unreadCount} chưa đọc
              </span>
            )}
          </h1>
          <p className="text-neutral-400 text-xs md:text-sm">
            Cập nhật tức thì các thông báo từ Ban Quản Trị, khi có người Follow, gửi Feedback, bình luận hoặc lưu nội dung của bạn.
          </p>
        </div>

        {/* Global Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchNotifications}
            className="p-2.5 rounded-2xl bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 transition-colors"
            title="Làm mới"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition-colors shadow-md"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Đọc tất cả</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs & Status Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-3 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm">
        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              categoryFilter === 'ALL'
                ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            Tất cả ({notifications.length})
          </button>

          <button
            onClick={() => setCategoryFilter('SYSTEM')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              categoryFilter === 'SYSTEM'
                ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Hệ thống</span>
          </button>

          <button
            onClick={() => setCategoryFilter('FOLLOW')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              categoryFilter === 'FOLLOW'
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Follow</span>
          </button>

          <button
            onClick={() => setCategoryFilter('FEEDBACK')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              categoryFilter === 'FEEDBACK'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Feedback</span>
          </button>

          <button
            onClick={() => setCategoryFilter('COMMENT')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              categoryFilter === 'COMMENT'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Bình luận</span>
          </button>

          <button
            onClick={() => setCategoryFilter('SAVE_LIKE')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              categoryFilter === 'SAVE_LIKE'
                ? 'bg-amber-500 text-black shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Lưu & Yêu thích</span>
          </button>
        </div>

        {/* Read / Unread Status Filter */}
        <div className="flex items-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-neutral-100 dark:border-neutral-800">
          <Filter className="w-3.5 h-3.5 text-neutral-400" />
          <select
            value={readFilter}
            onChange={e => setReadFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-semibold focus:outline-none border border-neutral-200 dark:border-neutral-700"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="UNREAD">Chưa đọc</option>
            <option value="READ">Đã đọc</option>
          </select>
        </div>
      </div>

      {/* Notification List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-20 bg-neutral-100 dark:bg-neutral-800/60 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-neutral-900 rounded-3xl border border-dashed border-neutral-200 dark:border-neutral-800 p-8 space-y-3">
          <Bell className="w-12 h-12 text-neutral-400 mx-auto opacity-30" />
          <h3 className="font-bold text-base text-neutral-800 dark:text-neutral-200">Bạn chưa có thông báo nào</h3>
          <p className="text-neutral-500 text-xs max-w-sm mx-auto">
            Khi có thông báo từ Ban Quản Trị, người Follow, bình luận, gửi Feedback hoặc tương tác với nội dung của bạn, thông báo sẽ xuất hiện ở đây.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map(notif => {
            const timeFormatted = new Date(notif.createdAt || 0).toLocaleString('vi-VN');
            const isSystemNotif = notif.isSystem || notif.type === 'SYSTEM' || notif.type === 'SYSTEM_BROADCAST' || !!notif.markdownContent;

            return (
              <div
                key={notif.id}
                onClick={() => {
                  handleMarkAsRead(notif.id);
                  if (['CONTENT_REMOVED', 'ACCOUNT_LOCKED', 'APPEAL_APPROVED', 'APPEAL_REJECTED'].includes(notif.type)) {
                    setRemovalModalData({
                      isOpen: true,
                      targetType: notif.targetType || 'FEEDBACK',
                      targetId: notif.targetId || user?.id || '',
                      targetName: notif.title,
                      removalReason: (notif as any).removalReason || notif.message,
                      removalDetails: (notif as any).removalDetails,
                      removalTime: (notif as any).removalTime || notif.createdAt
                    });
                  } else if (isSystemNotif) {
                    setSystemModalData({ isOpen: true, notification: notif });
                  } else if (notif.type === 'SUPPORT_REPLY' || notif.targetType === 'SUPPORT_TICKET') {
                    setSupportModalData({ isOpen: true, notification: notif });
                  }
                }}
                className={`group relative p-4 rounded-2xl border transition-all flex items-start gap-4 cursor-pointer ${
                  notif.read
                    ? 'bg-white dark:bg-neutral-900/60 border-neutral-200/80 dark:border-neutral-800/80 opacity-80'
                    : 'bg-white dark:bg-neutral-900 border-amber-500/40 dark:border-amber-500/30 shadow-sm ring-1 ring-amber-500/10'
                }`}
              >
                {!notif.read && (
                  <span className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                )}

                <div className="relative shrink-0">
                  <img
                    src={getValidAvatar(notif.senderAvatar)}
                    alt={notif.senderName || "User"}
                    className="w-11 h-11 rounded-full object-cover border border-neutral-200 dark:border-neutral-700"
                  />
                  <div className="absolute -bottom-1 -right-1 p-1 bg-white dark:bg-neutral-900 rounded-full shadow-sm border border-neutral-200 dark:border-neutral-800">
                    {getIconForType(notif.type)}
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-2 pr-6">
                    <h4 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                      {isSystemNotif && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md shrink-0">
                          Hệ thống
                        </span>
                      )}
                      <span>{notif.title}</span>
                    </h4>
                  </div>

                  <p className="text-xs md:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-2">
                    {notif.message}
                  </p>

                  <div className="flex items-center gap-4 pt-1 text-[11px] text-neutral-400">
                    <span>{timeFormatted}</span>
                    {(notif.link || notif.type === 'SUPPORT_REPLY' || notif.targetType === 'SUPPORT_TICKET' || isSystemNotif) && (
                      <button
                        onClick={e => handleNotificationAction(notif, e)}
                        className="text-amber-600 dark:text-amber-400 font-bold hover:underline"
                      >
                        Xem chi tiết →
                      </button>
                    )}
                    {(['CONTENT_REMOVED', 'ACCOUNT_LOCKED', 'APPEAL_APPROVED', 'APPEAL_REJECTED'].includes(notif.type) && !isSystemNotif && notif.type !== 'SUPPORT_REPLY' && notif.targetType !== 'SUPPORT_TICKET') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRemovalModalData({
                            isOpen: true,
                            targetType: notif.targetType || 'CHARACTER',
                            targetId: notif.targetId || user?.id || '',
                            targetName: notif.title,
                            removalReason: (notif as any).removalReason || notif.message,
                            removalDetails: (notif as any).removalDetails,
                            removalTime: (notif as any).removalTime || notif.createdAt
                          });
                        }}
                        className="text-red-600 dark:text-red-400 font-black hover:underline flex items-center gap-1"
                      >
                        🛡️ Chi tiết xử lý & Kháng nghị
                      </button>
                    )}
                  </div>

                  {notif.type === 'MODERATOR_INVITE' && !notif.read && notif.inviteStatus !== 'ACCEPTED' && notif.inviteStatus !== 'REJECTED' && (
                    <div className="flex items-center gap-2 pt-3">
                      <button
                        onClick={(e) => handleAcceptInvite(notif, e)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 text-white hover:bg-purple-500 rounded-xl text-xs font-extrabold transition-colors shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Chấp nhận</span>
                      </button>
                      <button
                        onClick={(e) => handleRejectInvite(notif, e)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl text-xs font-bold transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Từ chối</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleDeleteNotif(notif.id, e)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    title="Xóa thông báo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Components remain the same */}
      <DeletedContentModal 
        isOpen={isDeletedModalOpen}
        onClose={() => setIsDeletedModalOpen(false)}
        type={deletedType}
      />

      {removalModalData.targetId && (
        <RemovalDetailModal
          isOpen={removalModalData.isOpen}
          onClose={() => setRemovalModalData(prev => ({ ...prev, isOpen: false }))}
          targetType={removalModalData.targetType}
          targetId={removalModalData.targetId}
          targetName={removalModalData.targetName}
          removalReason={removalModalData.removalReason}
          removalDetails={removalModalData.removalDetails}
          removalTime={removalModalData.removalTime}
        />
      )}

      <SupportReplyModal
        isOpen={supportModalData.isOpen}
        onClose={() => setSupportModalData(prev => ({ ...prev, isOpen: false }))}
        notification={supportModalData.notification}
      />

      <SystemNotificationModal
        isOpen={systemModalData.isOpen}
        onClose={() => setSystemModalData(prev => ({ ...prev, isOpen: false }))}
        notification={systemModalData.notification}
      />
    </div>
  );
}
