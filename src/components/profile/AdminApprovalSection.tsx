import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Clock, UserCheck, AlertCircle } from 'lucide-react';
// Bỏ Firebase, dùng Supabase
import { supabase } from '../../lib/supabase';
import { getValidAvatar } from '../../lib/avatar';
import toast from 'react-hot-toast';

interface CreatorRequest {
  id: string;
  userId: string;
  userDisplayName: string;
  userAvatar?: string;
  userEmail?: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export default function AdminApprovalSection() {
  const [requests, setRequests] = useState<CreatorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPendingRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('creator_requests')
        .select('*')
        .eq('status', 'PENDING');
        
      if (error) throw error;
      setRequests((data as CreatorRequest[]) || []);
    } catch (err) {
      console.error("Failed to fetch creator requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const handleApprove = async (req: CreatorRequest) => {
    setProcessingId(req.id);
    try {
      const timestamp = new Date().toISOString();

      // 1. Update creator_requests table
      await supabase.from('creator_requests').update({
        status: 'APPROVED',
        updatedAt: timestamp
      }).eq('id', req.id);

      // 2. Update users table -> creatorStatus = true
      await supabase.from('users').update({
        creatorStatus: true,
        creatorRequestStatus: 'APPROVED'
      }).eq('id', req.userId);

      // 3. Send notification to user
      await supabase.from('notifications').insert({
        recipientId: req.userId,
        userId: req.userId,
        title: 'Yêu cầu Creator được phê duyệt',
        message: 'Chúc mừng! Quản trị viên đã phê duyệt yêu cầu trở thành Creator của bạn. Bạn đã có quyền đăng Character lên hệ thống!',
        type: 'SYSTEM',
        read: false,
        createdAt: timestamp
      });

      toast.success(`Đã phê duyệt ${req.userDisplayName} trở thành Creator!`);
      fetchPendingRequests();
    } catch (err: any) {
      console.error(err);
      toast.error("Phê duyệt thất bại: " + (err.message || "Lỗi không xác định"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (req: CreatorRequest) => {
    setProcessingId(req.id);
    try {
      const timestamp = new Date().toISOString();

      // 1. Update creator_requests table
      await supabase.from('creator_requests').update({
        status: 'REJECTED',
        updatedAt: timestamp
      }).eq('id', req.id);

      // 2. Update users table -> creatorRequestStatus = REJECTED
      await supabase.from('users').update({
        creatorRequestStatus: 'REJECTED'
      }).eq('id', req.userId);

      // 3. Send notification to user
      await supabase.from('notifications').insert({
        recipientId: req.userId,
        userId: req.userId,
        title: 'Yêu cầu Creator bị từ chối',
        message: 'Yêu cầu trở thành Creator của bạn đã bị từ chối bởi Quản trị viên.',
        type: 'SYSTEM',
        read: false,
        createdAt: timestamp
      });

      toast.success(`Đã từ chối yêu cầu của ${req.userDisplayName}.`);
      fetchPendingRequests();
    } catch (err: any) {
      console.error(err);
      toast.error("Từ chối thất bại.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-6 mb-8">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-amber-500/10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-amber-500" />
          <h3 className="font-bold text-base text-amber-900 dark:text-amber-300">
            Bảng Quản trị viên (Admin) - Xét duyệt Creator
          </h3>
        </div>
        <span className="px-2.5 py-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-xs rounded-full">
          {requests.length} Yêu cầu đang chờ
        </span>
      </div>

      {loading ? (
        <div className="text-xs text-neutral-400 py-4 text-center">Đang tải danh sách yêu cầu...</div>
      ) : requests.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-neutral-500 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Hiện không có yêu cầu xin làm Creator nào đang chờ duyệt.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div 
              key={req.id} 
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <img 
                  src={getValidAvatar(req.userAvatar)} 
                  alt={req.userDisplayName} 
                  className="w-10 h-10 rounded-full object-cover shrink-0 border border-neutral-200 dark:border-neutral-700" 
                />
                <div>
                  <div className="font-bold text-sm flex items-center gap-2">
                    {req.userDisplayName}
                  </div>
                  {req.reason && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                      " {req.reason} "
                    </div>
                  )}
                  <div className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Gửi lúc: {new Date(req.createdAt).toLocaleString('vi-VN')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={() => handleApprove(req)}
                  disabled={processingId === req.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shadow-sm"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Phê duyệt
                </button>
                <button
                  onClick={() => handleReject(req)}
                  disabled={processingId === req.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Từ chối
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
