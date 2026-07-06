import ProtectedLayoutClient from "./ProtectedLayoutClient";
import Navbar from "@/components/layout/Navbar/Navbar";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <ProtectedLayoutClient>{children}</ProtectedLayoutClient>
    </>
  );
}
