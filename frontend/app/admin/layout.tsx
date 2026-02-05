import Providers from "./_auth/Providers";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
