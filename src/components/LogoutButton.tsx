"use client";
export default function LogoutButton() {
  return (
    <button
      className="btn bg-[#3b4253] hover:bg-[#31384a]"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      Logout
    </button>
  );
}