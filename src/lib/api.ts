import { supabase } from "./supabase";

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  // Lấy phiên đăng nhập hiện tại từ Supabase
  const { data: { session } } = await supabase.auth.getSession();

  // Nếu người dùng đã đăng nhập, đính kèm Token của Supabase
  if (session && session.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  
  if (options.body && !(options.body instanceof FormData)) {
     headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { ...options, headers });
  
  // Đọc dữ liệu JSON trả về
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || "API Request Failed");
  }
  
  return data;
};
