import React, { createContext, useContext, useState, useEffect } from 'react';
// Xóa Firebase, thay bằng Supabase
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';

interface UserInteractionsContextType {
  likedCharacterIds: Set<string>;
  bookmarkedCharacterIds: Set<string>;
  bookmarkedPromptIds: Set<string>;
  followedCreatorIds: Set<string>;
  isCharacterLiked: (characterId: string) => boolean;
  isCharacterBookmarked: (characterId: string) => boolean;
  isPromptBookmarked: (promptId: string) => boolean;
  isCreatorFollowed: (creatorId: string) => boolean;
  setLikedState: (characterId: string, isLiked: boolean) => void;
  setBookmarkState: (targetId: string, targetType: 'CHARACTER' | 'PROMPT', isBookmarked: boolean) => void;
  setFollowState: (creatorId: string, isFollowed: boolean) => void;
  refreshInteractions: () => Promise<void>;
}

const UserInteractionsContext = createContext<UserInteractionsContextType>({
  likedCharacterIds: new Set(),
  bookmarkedCharacterIds: new Set(),
  bookmarkedPromptIds: new Set(),
  followedCreatorIds: new Set(),
  isCharacterLiked: () => false,
  isCharacterBookmarked: () => false,
  isPromptBookmarked: () => false,
  isCreatorFollowed: () => false,
  setLikedState: () => {},
  setBookmarkState: () => {},
  setFollowState: () => {},
  refreshInteractions: async () => {},
});

export const UserInteractionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuthStore();
  const [likedCharacterIds, setLikedCharacterIds] = useState<Set<string>>(new Set());
  const [bookmarkedCharacterIds, setBookmarkedCharacterIds] = useState<Set<string>>(new Set());
  const [bookmarkedPromptIds, setBookmarkedPromptIds] = useState<Set<string>>(new Set());
  const [followedCreatorIds, setFollowedCreatorIds] = useState<Set<string>>(new Set());

  const fetchInteractions = async () => {
    if (!user?.id) {
      setLikedCharacterIds(new Set());
      setBookmarkedCharacterIds(new Set());
      setBookmarkedPromptIds(new Set());
      setFollowedCreatorIds(new Set());
      return;
    }

    try {
      // 1. Fetch character likes (Supabase)
      const { data: likesData, error: likesError } = await supabase
        .from('character_likes')
        .select('characterId')
        .eq('userId', user.id);

      if (!likesError && likesData) {
        const likesSet = new Set<string>();
        likesData.forEach(item => {
          if (item.characterId) likesSet.add(item.characterId);
        });
        setLikedCharacterIds(likesSet);
      }

      // 2. Fetch bookmarks (Supabase)
      const { data: bookData, error: bookError } = await supabase
        .from('bookmarks')
        .select('targetId, targetType')
        .eq('userId', user.id);

      if (!bookError && bookData) {
        const charBooksSet = new Set<string>();
        const promptBooksSet = new Set<string>();
        bookData.forEach(item => {
          if (item.targetType === 'CHARACTER' && item.targetId) {
            charBooksSet.add(item.targetId);
          } else if (item.targetType === 'PROMPT' && item.targetId) {
            promptBooksSet.add(item.targetId);
          }
        });
        setBookmarkedCharacterIds(charBooksSet);
        setBookmarkedPromptIds(promptBooksSet);
      }

      // 3. Fetch followed creators (Supabase)
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('creatorId, targetCreatorId')
        .eq('followerId', user.id);

      if (!followError && followData) {
        const followsSet = new Set<string>();
        followData.forEach(item => {
          const cId = item.creatorId || item.targetCreatorId;
          if (cId) followsSet.add(cId);
        });
        setFollowedCreatorIds(followsSet);
      }
    } catch (err) {
      console.error("Error fetching user interactions with Supabase:", err);
    }
  };

  useEffect(() => {
    fetchInteractions();
  }, [user?.id]);

  const isCharacterLiked = (characterId: string) => likedCharacterIds.has(characterId);
  const isCharacterBookmarked = (characterId: string) => bookmarkedCharacterIds.has(characterId);
  const isPromptBookmarked = (promptId: string) => bookmarkedPromptIds.has(promptId);
  const isCreatorFollowed = (creatorId: string) => followedCreatorIds.has(creatorId);

  const setLikedState = (characterId: string, isLiked: boolean) => {
    setLikedCharacterIds(prev => {
      const next = new Set(prev);
      if (isLiked) next.add(characterId);
      else next.delete(characterId);
      return next;
    });
  };

  const setBookmarkState = (targetId: string, targetType: 'CHARACTER' | 'PROMPT', isBookmarked: boolean) => {
    if (targetType === 'CHARACTER') {
      setBookmarkedCharacterIds(prev => {
        const next = new Set(prev);
        if (isBookmarked) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
    } else {
      setBookmarkedPromptIds(prev => {
        const next = new Set(prev);
        if (isBookmarked) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
    }
  };

  const setFollowState = (creatorId: string, isFollowed: boolean) => {
    setFollowedCreatorIds(prev => {
      const next = new Set(prev);
      if (isFollowed) next.add(creatorId);
      else next.delete(creatorId);
      return next;
    });
  };

  return (
    <UserInteractionsContext.Provider
      value={{
        likedCharacterIds,
        bookmarkedCharacterIds,
        bookmarkedPromptIds,
        followedCreatorIds,
        isCharacterLiked,
        isCharacterBookmarked,
        isPromptBookmarked,
        isCreatorFollowed,
        setLikedState,
        setBookmarkState,
        setFollowState,
        refreshInteractions: fetchInteractions,
      }}
    >
      {children}
    </UserInteractionsContext.Provider>
  );
};

export const useUserInteractions = () => useContext(UserInteractionsContext);
