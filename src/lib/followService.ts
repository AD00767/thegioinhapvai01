import { supabase } from './supabase';

export interface FollowResult {
  success: boolean;
  following: boolean;
  followerCount: number;
  message?: string;
}

export async function checkIsFollowing(followerId: string, creatorId: string): Promise<boolean> {
  if (!followerId || !creatorId || followerId === creatorId) return false;

  try {
    const { data, error } = await supabase
      .from('follows')
      .select('followerId')
      .eq('followerId', followerId)
      .eq('creatorId', creatorId)
      .limit(1);

    if (error) throw error;
    return data && data.length > 0;
  } catch (error) {
    console.error("Error checking follow status:", error);
    return false;
  }
}

export async function reconcileFollowerCount(creatorId: string): Promise<number> {
  if (!creatorId) return 0;

  try {
    const { count, error } = await supabase
      .from('follows')
      .select('followerId', { count: 'exact', head: true })
      .eq('creatorId', creatorId);

    if (error) throw error;
    
    const actualCount = count || 0;

    // Cập nhật số lượng người theo dõi vào bảng users
    await supabase.from('users').update({ followerCount: actualCount }).eq('id', creatorId);
    
    return actualCount;
  } catch (error) {
    console.error("Error reconciling follower count:", error);
    return 0;
  }
}

export async function getFollowerCount(creatorId: string): Promise<number> {
  return reconcileFollowerCount(creatorId);
}

export async function toggleFollow(
  followerId: string,
  creatorId: string,
  followerInfo?: { displayName?: string; avatar?: string }
): Promise<FollowResult> {
  if (!followerId || !creatorId) {
    return { success: false, following: false, followerCount: 0, message: "Yêu cầu không hợp lệ." };
  }

  if (followerId === creatorId) {
    return { success: false, following: false, followerCount: 0, message: "Bạn không thể tự theo dõi chính mình!" };
  }

  try {
    const currentlyFollowing = await checkIsFollowing(followerId, creatorId);
    
    if (currentlyFollowing) {
      // Hủy theo dõi
      await supabase.from('follows')
        .delete()
        .eq('followerId', followerId)
        .eq('creatorId', creatorId);
    } else {
      // Theo dõi mới
      await supabase.from('follows').insert({
        followerId,
        creatorId,
        targetCreatorId: creatorId,
        followerName: followerInfo?.displayName || 'Người dùng',
        followerAvatar: followerInfo?.avatar || ''
      });

      // Tạo thông báo
      await supabase.from('notifications').insert({
        userId: creatorId,
        type: 'FOLLOW',
        title: 'Người theo dõi mới',
        body: `${followerInfo?.displayName || "Một người dùng"} đã bắt đầu theo dõi bạn.`,
        isRead: false
      });
    }

    const newFollowerCount = await reconcileFollowerCount(creatorId);

    return {
      success: true,
      following: !currentlyFollowing,
      followerCount: newFollowerCount,
      message: !currentlyFollowing ? "Đã theo dõi Creator!" : "Đã hủy theo dõi Creator."
    };
  } catch (error) {
    console.error("Error toggling follow:", error);
    const count = await reconcileFollowerCount(creatorId);
    const following = await checkIsFollowing(followerId, creatorId);

    return {
      success: false,
      following,
      followerCount: count,
      message: "Thao tác thất bại, vui lòng thử lại."
    };
  }
}
