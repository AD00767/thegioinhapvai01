# Thế giới nhập vai_AD

Khởi đầu cho mọi hành trình Roleplay. Nền tảng cộng đồng dành cho Google AI Studio.

## Kiến trúc & Giả định (Architecture & Assumptions)

Theo yêu cầu của dự án, dự án được xây dựng dưới dạng Full-stack website.

1. **Tech Stack & Cơ sở dữ liệu (Database)**
   - Cơ sở dữ liệu và hệ thống xác thực sử dụng **Supabase (PostgreSQL & Supabase Auth)**. Điều này đáp ứng hoàn hảo nhu cầu mở rộng, realtime và kiến trúc hiện đại.
   - **Backend:** Node.js (Express), kết nối trực tiếp với Supabase Client.
   - **Frontend:** React 19 (Vite), Tailwind CSS 4, Zustand (State Management), React Router.

2. **AI Search (Tìm kiếm bằng AI)**
   - Sử dụng `Gemini 2.5 Flash` qua `@google/genai` trên Backend để phân tích truy vấn ngôn ngữ tự nhiên của người dùng thành các tiêu chí lọc có cấu trúc (Tags, Gender, Keywords).
   - Truy vấn Supabase dựa trên tiêu chí được AI bóc tách để lọc nội dung một cách chính xác mà không cần người dùng nhập đúng từ khóa tuyệt đối.

3. **Bảo mật & Hiệu năng (Security & Performance)**
   - Ứng dụng Express Rate Limit chặn spam (Max 100 requests/15 mins).
   - Xác thực và phân quyền bằng Row Level Security (RLS) của PostgreSQL trên Supabase.
   - Frontend áp dụng Skeleton Loading, Responsive đầy đủ (Mobile First), Hỗ trợ Dark Mode/Light Mode.
