import { supabase } from './supabase';
import { PromptItem } from '../types';

export interface ExecuteDeletePromptParams {
  prompt: PromptItem;
  currentUser: any;
  reason?: string;
  details?: string;
}

export async function executeDeletePrompt({
  prompt,
  currentUser,
  reason,
  details
}: ExecuteDeletePromptParams) {
  if (!currentUser) {
    throw new Error("Bạn chưa đăng nhập.");
  }

  const isOwner = currentUser.id === prompt.authorId;
  const isAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'MODERATOR';

  if (!isOwner && !isAdmin) {
    throw new Error("Bạn không có quyền xóa Prompt này.");
  }

  const timestamp = new Date().toISOString();

  if (isAdmin) {
    const removalReason = reason?.trim() || "Vi phạm tiêu chuẩn cộng đồng";
    const removalDetails = details?.trim() || "";

    // 1. Cập nhật trạng thái Prompt thành đã xóa/ẩn
    await supabase.from('prompts').update({
      isHidden: true,
      deletedAt: timestamp,
      deletedBy: currentUser.id,
      removalReason,
      removalDetails,
      removalTime: timestamp,
      appealStatus: 'NONE'
    }).eq('id', prompt.id);

    // 2. Gửi thông báo cho tác giả nếu Admin/Mod xóa prompt của người khác
    if (prompt.authorId && prompt.authorId !== currentUser.id) {
      await supabase.from('notifications').insert({
        userId: prompt.authorId,
        type: 'CONTENT_REMOVED',
        title: 'Prompt của bạn đã bị gỡ bỏ',
        content: `Prompt "${prompt.name || prompt.title || 'Không tiêu đề'}" đã bị gỡ bỏ do: ${removalReason}.`,
        targetType: 'PROMPT',
        targetId: prompt.id,
        targetName: prompt.name || prompt.title || 'Prompt',
        removalReason,
        removalDetails,
        isRead: false,
        createdAt: timestamp
      });
    }

    // 3. Ghi log hoạt động
    await supabase.from('activity_logs').insert({
      userId: currentUser.id,
      userName: currentUser.displayName || 'Admin/Mod',
      action: 'REMOVE_PROMPT',
      details: `Gỡ bỏ Prompt "${prompt.name || prompt.title || 'Prompt'}" (ID: ${prompt.id}) - Lý do: ${removalReason}`,
      timestamp: timestamp
    });
  } else {
    // Tự xóa prompt của chính mình
    await supabase.from('prompts').update({
      isHidden: true,
      deletedAt: timestamp,
      deletedBy: currentUser.id
    }).eq('id', prompt.id);
  }
}
